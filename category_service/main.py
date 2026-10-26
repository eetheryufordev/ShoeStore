
from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from category_service.database import get_db
from category_service import models, schemas
from user_service.security import require_role

app = FastAPI(
    title="ShoeStore Category Service",
    description="API quan ly danh muc giay",
    version="1.0.0",
    dependencies=[Depends(require_role)],
)


@app.get("/")
def home():
    return {"message": "Category Service dang hoat dong"}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database connection failed")


def get_category_or_404(db: Session, category_id: int):
    category = db.query(models.Category).filter(
        models.Category.id == category_id
    ).first()

    if category is None:
        raise HTTPException(
            status_code=404,
            detail="Khong tim thay danh muc",
        )

    return category


def check_name_unique(db: Session, name: str, exclude_id: int | None = None):
    query = db.query(models.Category).filter(models.Category.name == name)

    if exclude_id is not None:
        query = query.filter(models.Category.id != exclude_id)

    if query.first() is not None:
        raise HTTPException(
            status_code=409,
            detail="Ten danh muc da ton tai",
        )


# 1. Lay danh sach danh muc
@app.get("/categories", response_model=list[schemas.CategoryResponse])
def get_categories(
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
        db.query(models.Category)
        .order_by(models.Category.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


# 2. Lay chi tiet mot danh muc
@app.get("/categories/{category_id}", response_model=schemas.CategoryResponse)
def get_category(category_id: int, db: Session = Depends(get_db)):
    return get_category_or_404(db, category_id)


# 3. Them danh muc
@app.post(
    "/categories",
    response_model=schemas.CategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    category_data: schemas.CategoryCreate,
    db: Session = Depends(get_db),
):
    name = category_data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Ten danh muc khong duoc de trong")

    check_name_unique(db, name)

    category = models.Category(
        name=name,
        description=category_data.description,
    )

    try:
        db.add(category)
        db.commit()
        db.refresh(category)
        return category
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ten danh muc da ton tai")
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the them danh muc",
        )


# 4. Cap nhat danh muc
@app.put("/categories/{category_id}", response_model=schemas.CategoryResponse)
def update_category(
    category_id: int,
    category_data: schemas.CategoryUpdate,
    db: Session = Depends(get_db),
):
    category = get_category_or_404(db, category_id)
    updates = category_data.model_dump(exclude_unset=True)

    if "name" in updates:
        if updates["name"] is None or not updates["name"].strip():
            raise HTTPException(status_code=422, detail="Ten danh muc khong duoc de trong")
        updates["name"] = updates["name"].strip()
        check_name_unique(db, updates["name"], exclude_id=category_id)

    for field, value in updates.items():
        setattr(category, field, value)

    try:
        db.commit()
        db.refresh(category)
        return category
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ten danh muc da ton tai")
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the cap nhat danh muc",
        )


# 5. Xoa danh muc
@app.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
):
    category = get_category_or_404(db, category_id)

    # Bang products co FK ON DELETE RESTRICT, nen kiem tra truoc de bao loi ro rang.
    product_count = db.execute(
        text("SELECT COUNT(*) FROM products WHERE category_id = :category_id"),
        {"category_id": category_id},
    ).scalar()

    if product_count:
        raise HTTPException(
            status_code=409,
            detail=f"Khong the xoa: danh muc dang co {product_count} san pham",
        )

    try:
        db.delete(category)
        db.commit()
        return {
            "message": "Xoa danh muc thanh cong",
            "id": category_id,
        }
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the xoa danh muc",
        )
