import uuid

from fastapi import Depends, FastAPI, HTTPException, Path, Query, status
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from user_service import models, schemas
from user_service.database import get_db, initialize_user_schema
from user_service.security import (
    create_access_token,
    hash_password,
    require_role,
    verify_password,
)

app = FastAPI(
    title="ShoeStore User Service",
    description="API quan ly ho so khach hang",
    version="1.0.0",
    dependencies=[Depends(require_role)],
)


@app.on_event("startup")
def startup():
    initialize_user_schema()


@app.get("/")
def home():
    return {"message": "User Service dang hoat dong"}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        ) from exc


def get_user_or_404(db: Session, user_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Khong tim thay nguoi dung")
    return user


def check_unique(
    db: Session,
    field: str,
    value: str,
    exclude_user_id: int | None = None,
):
    query = db.query(models.User).filter(getattr(models.User, field) == value)
    if exclude_user_id is not None:
        query = query.filter(models.User.id != exclude_user_id)
    if query.first() is not None:
        message = "Username da duoc su dung" if field == "username" else "Email da duoc su dung"
        raise HTTPException(status_code=409, detail=message)


def create_user_record(
    db: Session,
    full_name: str,
    username: str,
    password: str,
    role: str,
    email: str,
    phone: str | None,
    address: str | None,
):
    full_name = full_name.strip()
    if not full_name:
        raise HTTPException(status_code=422, detail="Ten khong duoc de trong")

    username = username.strip().lower()
    email = email.strip().lower()
    check_unique(db, "username", username)
    check_unique(db, "email", email)

    user = models.User(
        public_code=f"USR-{uuid.uuid4().hex.upper()}",
        full_name=full_name,
        username=username,
        password_hash=hash_password(password),
        role=role,
        email=email,
        phone=phone.strip() if phone else None,
        address=address.strip() if address else None,
    )
    db.add(user)
    return user


@app.post("/auth/login", response_model=schemas.LoginResponse)
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    username = login_data.username.strip().lower()
    user = db.query(models.User).filter(models.User.username == username).first()
    if (
        user is None
        or user.password_hash == "DISABLED"
        or not verify_password(login_data.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=401,
            detail="Username hoac mat khau khong dung",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user.public_code, user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }


@app.post(
    "/auth/register",
    response_model=schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    user_data: schemas.UserRegister,
    db: Session = Depends(get_db),
):
    user = create_user_record(
        db=db,
        full_name=user_data.full_name,
        username=user_data.username,
        password=user_data.password,
        role="CUSTOMER",
        email=str(user_data.email),
        phone=user_data.phone,
        address=user_data.address,
    )
    try:
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Username hoac email da duoc su dung",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the tao tai khoan",
        ) from exc


@app.get("/auth/me", response_model=schemas.UserResponse)
def get_current_user(
    claims: dict = Depends(require_role),
    db: Session = Depends(get_db),
):
    user = (
        db.query(models.User)
        .filter(models.User.public_code == claims["sub"])
        .first()
    )
    if user is None:
        raise HTTPException(status_code=401, detail="Tai khoan khong con ton tai")
    return user


@app.get("/users", response_model=list[schemas.UserResponse])
def get_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.User)
        .order_by(models.User.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.get("/users/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int = Path(gt=0), db: Session = Depends(get_db)):
    return get_user_or_404(db, user_id)


@app.post(
    "/users",
    response_model=schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    user = create_user_record(
        db=db,
        full_name=user_data.full_name,
        username=user_data.username,
        password=user_data.password,
        role=user_data.role,
        email=str(user_data.email),
        phone=user_data.phone,
        address=user_data.address,
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Username hoac email da duoc su dung",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the tao nguoi dung",
        ) from exc


@app.put("/users/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_data: schemas.UserUpdate,
    user_id: int = Path(gt=0),
    db: Session = Depends(get_db),
):
    user = get_user_or_404(db, user_id)
    updates = user_data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Khong co thong tin cap nhat")

    if "full_name" in updates:
        full_name = updates["full_name"]
        if full_name is None or not full_name.strip():
            raise HTTPException(status_code=422, detail="Ten khong duoc de trong")
        updates["full_name"] = full_name.strip()

    if "username" in updates:
        username = updates["username"]
        if username is None:
            raise HTTPException(status_code=422, detail="Username khong duoc de trong")
        username = username.strip().lower()
        check_unique(db, "username", username, exclude_user_id=user_id)
        updates["username"] = username

    if "password" in updates:
        password = updates.pop("password")
        if password is None:
            raise HTTPException(status_code=422, detail="Mat khau khong duoc de trong")
        updates["password_hash"] = hash_password(password)

    if "role" in updates and updates["role"] is None:
        raise HTTPException(status_code=422, detail="Vai tro khong duoc de trong")
    if user.role == "ADMIN" and updates.get("role") == "CUSTOMER":
        admin_count = db.query(func.count(models.User.id)).filter(
            models.User.role == "ADMIN"
        ).scalar()
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail="Khong the ha quyen ADMIN cuoi cung",
            )

    if "email" in updates:
        email = updates["email"]
        if email is None:
            raise HTTPException(status_code=422, detail="Email khong duoc de trong")
        email = str(email).strip().lower()
        check_unique(db, "email", email, exclude_user_id=user_id)
        updates["email"] = email

    for field in ("phone", "address"):
        if field in updates and updates[field] is not None:
            updates[field] = updates[field].strip() or None

    for field, value in updates.items():
        setattr(user, field, value)

    try:
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email da duoc su dung") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the cap nhat nguoi dung",
        ) from exc


@app.delete("/users/{user_id}")
def delete_user(user_id: int = Path(gt=0), db: Session = Depends(get_db)):
    user = get_user_or_404(db, user_id)
    if user.role == "ADMIN":
        admin_count = db.query(func.count(models.User.id)).filter(
            models.User.role == "ADMIN"
        ).scalar()
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail="Khong the xoa ADMIN cuoi cung",
            )
    try:
        db.delete(user)
        db.commit()
        return {"message": "Xoa nguoi dung thanh cong", "id": user_id}
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Khong the xoa nguoi dung",
        ) from exc
