
from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from product_service.database import get_db
from product_service import models, schemas

app = FastAPI(
    title="ShoeStore Product Service",
    description="API quan ly san pham giay",
    version="1.0.0",
)


@app.get("/")
def home():
    return {"message": "Product Service dang hoat dong"}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database connection failed")


def get_product_or_404(db: Session, product_id: int):
    product = db.query(models.Product).filter(
        models.Product.id == product_id
    ).first()

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Khong tim thay san pham",
        )

    return product


def check_category(db: Session, category_id: int):
    category = db.query(models.Category).filter(
        models.Category.id == category_id
    ).first()

    if category is None:
        raise HTTPException(
            status_code=400,
            detail="category_id khong ton tai",
        )


# 1. Lay danh sach san pham
@app.get("/products", response_model=list[schemas.ProductResponse])
def get_products(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if skip < 0 or limit < 1 or limit > 500:
        raise HTTPException(
            status_code=400,
            detail="skip phai >= 0 va limit tu 1 den 500",
        )

    return (
        db.query(models.Product)
        .order_by(models.Product.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


# 2. Lay chi tiet mot san pham
@app.get("/products/{product_id}", response_model=schemas.ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return get_product_or_404(db, product_id)


# 3. Them san pham
@app.post(
    "/products",
    response_model=schemas.ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    product_data: schemas.ProductCreate,
    db: Session = Depends(get_db),
):
    check_category(db, product_data.category_id)

    product = models.Product(**product_data.model_dump())

    try:
        db.add(product)
        db.commit()
        db.refresh(product)
        return product
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the them san pham",
        )


# 4. Cap nhat san pham
@app.put("/products/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: int,
    product_data: schemas.ProductUpdate,
    db: Session = Depends(get_db),
):
    product = get_product_or_404(db, product_id)
    updates = product_data.model_dump(exclude_unset=True)

    if "category_id" in updates and updates["category_id"] is not None:
        check_category(db, updates["category_id"])

    for field, value in updates.items():
        setattr(product, field, value)

    try:
        db.commit()
        db.refresh(product)
        return product
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the cap nhat san pham",
        )


# 5. Xoa san pham
@app.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = get_product_or_404(db, product_id)

    try:
        db.delete(product)
        db.commit()
        return {
            "message": "Xoa san pham thanh cong",
            "id": product_id,
        }
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the xoa san pham",
        )
