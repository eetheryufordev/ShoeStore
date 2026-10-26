
from decimal import Decimal
from enum import Enum

from fastapi import Depends, FastAPI, HTTPException, Path, Query
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from order_service.database import SessionLocal
from user_service.security import require_role


app = FastAPI(
    title="ShoeStore Order Service",
    description="Order management with size-based inventory",
    version="2.0.0",
    dependencies=[Depends(require_role)],
)


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    PROCESSING = "PROCESSING"
    SHIPPING = "SHIPPING"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


class OrderItemRequest(BaseModel):
    variant_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


class OrderCreateRequest(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=9, max_length=30)
    email: EmailStr
    shipping_address: str = Field(min_length=5, max_length=500)
    items: list[OrderItemRequest] = Field(min_length=1)


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "order_service"
    }


@app.post("/orders", status_code=201)
def create_order(order: OrderCreateRequest):
    db = SessionLocal()

    try:
        customer_name = order.customer_name.strip()
        phone = order.phone.strip()
        email = str(order.email).strip()
        shipping_address = order.shipping_address.strip()

        if not customer_name or not phone or not shipping_address:
            raise HTTPException(
                status_code=422,
                detail="Thong tin khach hang khong duoc de trong"
            )

        # Gộp các dòng đặt trùng cùng một size.
        quantities = {}
        for item in order.items:
            quantities[item.variant_id] = (
                quantities.get(item.variant_id, 0) + item.quantity
            )

        # Khóa các size theo thứ tự ID để giảm nguy cơ deadlock.
        variant_ids = sorted(quantities.keys())
        variants = {}

        for variant_id in variant_ids:
            variant = db.execute(
                text("""
                    SELECT
                        pv.id AS variant_id,
                        pv.product_id,
                        pv.size,
                        pv.stock,
                        p.name AS product_name,
                        p.price
                    FROM product_variants pv
                    JOIN products p ON p.id = pv.product_id
                    WHERE pv.id = :variant_id
                    FOR UPDATE
                """),
                {"variant_id": variant_id}
            ).mappings().first()

            if not variant:
                raise HTTPException(
                    status_code=404,
                    detail=f"Khong tim thay size giay ID {variant_id}"
                )

            quantity = quantities[variant_id]

            if variant["stock"] < quantity:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Khong du ton kho: {variant['product_name']} "
                        f"size {variant['size']}. "
                        f"Con lai: {variant['stock']}"
                    )
                )

            variants[variant_id] = variant

        # Tính tổng tiền theo giá sản phẩm trong database.
        total_amount = Decimal("0.00")

        for variant_id in variant_ids:
            variant = variants[variant_id]
            total_amount += (
                Decimal(str(variant["price"]))
                * quantities[variant_id]
            )

        # Tạo đơn hàng.
        result = db.execute(
            text("""
                INSERT INTO orders (
                    customer_name,
                    phone,
                    email,
                    shipping_address,
                    total_amount,
                    status
                )
                VALUES (
                    :customer_name,
                    :phone,
                    :email,
                    :shipping_address,
                    :total_amount,
                    'PENDING'
                )
            """),
            {
                "customer_name": customer_name,
                "phone": phone,
                "email": email,
                "shipping_address": shipping_address,
                "total_amount": total_amount
            }
        )

        order_id = result.lastrowid
        db.execute(
            text("""
                INSERT INTO order_status_history (
                    order_id,
                    previous_status,
                    new_status
                )
                VALUES (:order_id, NULL, 'PENDING')
            """),
            {"order_id": order_id}
        )
        order_items = []

        for variant_id in variant_ids:
            variant = variants[variant_id]
            quantity = quantities[variant_id]
            unit_price = Decimal(str(variant["price"]))
            subtotal = unit_price * quantity

            # Chỉ trừ tồn kho của size khách đã chọn.
            update_result = db.execute(
                text("""
                    UPDATE product_variants
                    SET stock = stock - :quantity
                    WHERE id = :variant_id
                      AND stock >= :quantity
                """),
                {
                    "quantity": quantity,
                    "variant_id": variant_id
                }
            )

            if update_result.rowcount != 1:
                raise HTTPException(
                    status_code=409,
                    detail="Ton kho size giay da thay doi, vui long thu lai"
                )

            # Lưu cả sản phẩm, size và phiên bản đã đặt.
            db.execute(
                text("""
                    INSERT INTO order_items (
                        order_id,
                        product_id,
                        variant_id,
                        size,
                        product_name,
                        quantity,
                        unit_price,
                        subtotal
                    )
                    VALUES (
                        :order_id,
                        :product_id,
                        :variant_id,
                        :size,
                        :product_name,
                        :quantity,
                        :unit_price,
                        :subtotal
                    )
                """),
                {
                    "order_id": order_id,
                    "product_id": variant["product_id"],
                    "variant_id": variant_id,
                    "size": variant["size"],
                    "product_name": variant["product_name"],
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "subtotal": subtotal
                }
            )

            order_items.append({
                "product_id": variant["product_id"],
                "variant_id": variant_id,
                "product_name": variant["product_name"],
                "size": variant["size"],
                "quantity": quantity,
                "unit_price": str(unit_price),
                "subtotal": str(subtotal)
            })

        # Chỉ commit khi toàn bộ thao tác đều thành công.
        db.commit()

        return {
            "message": "Dat hang thanh cong",
            "order_id": order_id,
            "customer_name": customer_name,
            "phone": phone,
            "email": email,
            "shipping_address": shipping_address,
            "total_amount": str(total_amount),
            "status": OrderStatus.PENDING.value,
            "items": order_items
        }

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Loi database khi tao don hang; giao dich da rollback"
        )

    finally:
        db.close()


@app.get("/orders")
def get_orders(
    status: OrderStatus | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500)
):
    db = SessionLocal()

    try:
        query = """
            SELECT
                id,
                customer_name,
                phone,
                email,
                shipping_address,
                total_amount,
                status,
                created_at,
                updated_at
            FROM orders
        """
        parameters = {"limit": limit, "skip": skip}

        if status is not None:
            query += " WHERE status = :status"
            parameters["status"] = status.value

        query += " ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :skip"

        orders = db.execute(text(query), parameters).mappings().all()
        return [dict(order) for order in orders]

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="Loi database khi lay danh sach don hang"
        )

    finally:
        db.close()


@app.get("/orders/{order_id}")
def get_order(order_id: int = Path(gt=0)):
    db = SessionLocal()

    try:
        order = db.execute(
            text("""
                SELECT
                    id,
                    customer_name,
                    phone,
                    email,
                    shipping_address,
                    total_amount,
                    status,
                    created_at,
                    updated_at
                FROM orders
                WHERE id = :order_id
            """),
            {"order_id": order_id}
        ).mappings().first()

        if order is None:
            raise HTTPException(status_code=404, detail="Khong tim thay don hang")

        items = db.execute(
            text("""
                SELECT
                    product_id,
                    variant_id,
                    product_name,
                    size,
                    quantity,
                    unit_price,
                    subtotal
                FROM order_items
                WHERE order_id = :order_id
                ORDER BY id
            """),
            {"order_id": order_id}
        ).mappings().all()
        history = db.execute(
            text("""
                SELECT previous_status, new_status, changed_at
                FROM order_status_history
                WHERE order_id = :order_id
                ORDER BY id
            """),
            {"order_id": order_id}
        ).mappings().all()

        return {
            **dict(order),
            "items": [dict(item) for item in items],
            "status_history": [dict(entry) for entry in history]
        }

    except HTTPException:
        raise

    except SQLAlchemyError:
        raise HTTPException(
            status_code=500,
            detail="Loi database khi lay chi tiet don hang"
        )

    finally:
        db.close()


@app.delete("/orders/{order_id}")
def delete_order(order_id: int = Path(gt=0)):
    db = SessionLocal()

    try:
        order = db.execute(
            text("""
                SELECT status
                FROM orders
                WHERE id = :order_id
                FOR UPDATE
            """),
            {"order_id": order_id}
        ).mappings().first()

        if order is None:
            raise HTTPException(status_code=404, detail="Khong tim thay don hang")

        if order["status"] != OrderStatus.CANCELLED.value:
            raise HTTPException(
                status_code=409,
                detail="Chi co the xoa don hang da huy"
            )

        db.execute(
            text("DELETE FROM orders WHERE id = :order_id"),
            {"order_id": order_id}
        )
        db.commit()
        return {"message": "Da xoa don hang"}

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Loi database khi xoa don hang"
        )

    finally:
        db.close()


@app.patch("/orders/{order_id}/status")
def update_order_status(
    update: OrderStatusUpdate,
    order_id: int = Path(gt=0)
):
    db = SessionLocal()

    try:
        order = db.execute(
            text("""
                SELECT status
                FROM orders
                WHERE id = :order_id
                FOR UPDATE
            """),
            {"order_id": order_id}
        ).mappings().first()

        if order is None:
            raise HTTPException(status_code=404, detail="Khong tim thay don hang")

        current_status = OrderStatus(order["status"])
        new_status = update.status

        if new_status == current_status:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Don hang dang o trang thai nay",
                    "current_status": current_status.value,
                }
            )

        if current_status == OrderStatus.CANCELLED or new_status == OrderStatus.CANCELLED:
            items = db.execute(
                text("""
                    SELECT variant_id, SUM(quantity) AS quantity
                    FROM order_items
                    WHERE order_id = :order_id
                    GROUP BY variant_id
                    ORDER BY variant_id
                """),
                {"order_id": order_id}
            ).mappings().all()

            for item in items:
                if current_status == OrderStatus.CANCELLED:
                    stock_result = db.execute(
                        text("""
                            UPDATE product_variants
                            SET stock = stock - :quantity
                            WHERE id = :variant_id
                              AND stock >= :quantity
                        """),
                        {
                            "quantity": item["quantity"],
                            "variant_id": item["variant_id"]
                        }
                    )

                    if stock_result.rowcount != 1:
                        raise HTTPException(
                            status_code=409,
                            detail="Khong du ton kho de mo lai don hang"
                        )
                else:
                    db.execute(
                        text("""
                            UPDATE product_variants
                            SET stock = stock + :quantity
                            WHERE id = :variant_id
                        """),
                        {
                            "quantity": item["quantity"],
                            "variant_id": item["variant_id"]
                        }
                    )

        db.execute(
            text("""
                UPDATE orders
                SET status = :status
                WHERE id = :order_id
            """),
            {"status": new_status.value, "order_id": order_id}
        )
        db.execute(
            text("""
                INSERT INTO order_status_history (
                    order_id,
                    previous_status,
                    new_status
                )
                VALUES (:order_id, :previous_status, :new_status)
            """),
            {
                "order_id": order_id,
                "previous_status": current_status.value,
                "new_status": new_status.value
            }
        )
        db.commit()

        return {
            "order_id": order_id,
            "previous_status": current_status.value,
            "status": new_status.value
        }

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Loi database khi cap nhat trang thai don hang"
        )

    finally:
        db.close()
