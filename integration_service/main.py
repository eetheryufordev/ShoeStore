
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import httpx

app = FastAPI(
    title="ShoeStore Integration Service",
    description="API trung gian kết nối các service",
    version="1.0.0"
)

PRODUCT_SERVICE_URL = "http://127.0.0.1:8001"


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(ge=0)
    stock: int = Field(ge=0)
    category_id: int = Field(gt=0)
    image_url: str | None = None
    description: str | None = None


def forward_request(method: str, path: str, **kwargs):
    try:
        response = httpx.request(
            method,
            f"{PRODUCT_SERVICE_URL}{path}",
            timeout=10.0,
            **kwargs
        )
        response.raise_for_status()

        if response.status_code == 204:
            return {"message": "Thao tac thanh cong"}

        return response.json()

    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json().get(
                "detail", "Product Service returned an error"
            )
        except ValueError:
            detail = "Product Service returned an error"

        raise HTTPException(
            status_code=exc.response.status_code,
            detail=detail
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Khong the ket noi den Product Service"
        )


@app.get("/")
def home():
    return {"message": "ShoeStore Integration Service is running"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "integration_service"
    }


@app.get("/products")
def get_products(skip: int = 0, limit: int = 100):
    return forward_request(
        "GET",
        "/products",
        params={"skip": skip, "limit": limit}
    )


@app.get("/products/{product_id}")
def get_product(product_id: int):
    return forward_request("GET", f"/products/{product_id}")


@app.post("/products")
def create_product(product: ProductCreate):
    return forward_request(
        "POST",
        "/products",
        json=product.model_dump()
    )


@app.put("/products/{product_id}")
def update_product(product_id: int, product: ProductCreate):
    return forward_request(
        "PUT",
        f"/products/{product_id}",
        json=product.model_dump()
    )


@app.delete("/products/{product_id}")
def delete_product(product_id: int):
    return forward_request("DELETE", f"/products/{product_id}")
