
from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, text

from category_service.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    created_at = Column(
        TIMESTAMP,
        nullable=True,
        server_default=text("CURRENT_TIMESTAMP"),
    )
