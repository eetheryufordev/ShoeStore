from sqlalchemy import Column, Integer, String, TIMESTAMP, func, text

from user_service.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    public_code = Column(String(40), nullable=False, unique=True)
    full_name = Column(String(200), nullable=False)
    username = Column(String(50), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, server_default=text("'CUSTOMER'"))
    email = Column(String(254), nullable=False, unique=True)
    phone = Column(String(30), nullable=True)
    address = Column(String(500), nullable=True)
    created_at = Column(
        TIMESTAMP,
        nullable=True,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at = Column(
        TIMESTAMP,
        nullable=True,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=func.current_timestamp(),
    )
