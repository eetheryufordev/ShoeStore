
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    stock: int = Field(default=0, ge=0)
    image_url: str | None = Field(default=None, max_length=500)
    description: str | None = None
    category_id: int = Field(gt=0)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    price: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    stock: int | None = Field(default=None, ge=0)
    image_url: str | None = Field(default=None, max_length=500)
    description: str | None = None
    category_id: int | None = Field(default=None, gt=0)


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: Decimal
    stock: int
    image_url: str | None
    description: str | None
    category_id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProductVariantBase(BaseModel):
    size: str = Field(min_length=1, max_length=20)
    stock: int = Field(default=0, ge=0)

    @field_validator("size", mode="before")
    @classmethod
    def normalize_numeric_size(cls, value):
        if isinstance(value, int) and not isinstance(value, bool):
            return str(value)
        return value


class ProductVariantCreate(ProductVariantBase):
    pass


class ProductVariantUpdate(BaseModel):
    size: str | None = Field(default=None, min_length=1, max_length=20)
    stock: int | None = Field(default=None, ge=0)


class ProductVariantResponse(ProductVariantBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
