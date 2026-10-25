
from pathlib import Path as FilePath

from fastapi import FastAPI, HTTPException, Path, Query, Request
from fastapi.staticfiles import StaticFiles
import httpx

from fastapi.middleware.cors import CORSMiddleware
from product_service.schemas import ProductCreate, ProductUpdate
from category_service.schemas import CategoryCreate, CategoryUpdate
from order_service.main import (
    OrderCreateRequest,
    OrderStatus,
    OrderStatusUpdate,
)

app = FastAPI(
    title="ShoeStore Integration Service",
    description="API trung gian kết nối các service",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIRECTORY = FilePath(__file__).resolve().parent.parent / "storage"
app.mount(
    "/storage",
    StaticFiles(directory=STORAGE_DIRECTORY),
    name="storage",
)

PRODUCT_SERVICE_URL = "http://127.0.0.1:8001"
ORDER_SERVICE_URL = "http://127.0.0.1:8002"
CATEGORY_SERVICE_URL = "http://127.0.0.1:8003"


def forward_request(
    method: str,
    path: str,
    base_url: str = PRODUCT_SERVICE_URL,
    service_name: str = "Product Service",
    **kwargs
):
    try:
        response = httpx.request(
            method,
            f"{base_url}{path}",
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
                "detail", f"{service_name} returned an error"
            )
        except ValueError:
            detail = f"{service_name} returned an error"

        raise HTTPException(
            status_code=exc.response.status_code,
            detail=detail
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail=f"Khong the ket noi den {service_name}"
        )


def forward_order_request(method: str, path: str, **kwargs):
    return forward_request(
        method,
        path,
        base_url=ORDER_SERVICE_URL,
        service_name="Order Service",
        **kwargs
    )


def forward_category_request(method: str, path: str, **kwargs):
    return forward_request(
        method,
        path,
        base_url=CATEGORY_SERVICE_URL,
        service_name="Category Service",
        **kwargs
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


# ---------------------- Categories ----------------------

@app.get("/categories")
def get_categories(skip: int = 0, limit: int = 100):
    return forward_category_request(
        "GET",
        "/categories",
        params={"skip": skip, "limit": limit}
    )


@app.get("/categories/{category_id}")
def get_category(category_id: int):
    return forward_category_request("GET", f"/categories/{category_id}")


@app.post("/categories", status_code=201)
def create_category(category: CategoryCreate):
    return forward_category_request(
        "POST",
        "/categories",
        json=category.model_dump(mode="json")
    )


@app.put("/categories/{category_id}")
def update_category(category_id: int, category: CategoryUpdate):
    return forward_category_request(
        "PUT",
        f"/categories/{category_id}",
        json=category.model_dump(mode="json", exclude_unset=True)
    )


@app.delete("/categories/{category_id}")
def delete_category(category_id: int):
    return forward_category_request("DELETE", f"/categories/{category_id}")


# ---------------------- Products ----------------------

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


async def parse_product_payload(request: Request):
    import uuid
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        payload = {}
        for field in ("name", "description", "image_url"):
            val = form.get(field)
            if val is not None and str(val).strip():
                payload[field] = str(val).strip()

        if form.get("price") is not None and str(form.get("price")).strip():
            payload["price"] = float(form.get("price"))
        if form.get("stock") is not None and str(form.get("stock")).strip():
            payload["stock"] = int(form.get("stock"))
        if form.get("category_id") is not None and str(form.get("category_id")).strip():
            payload["category_id"] = int(form.get("category_id"))

        image_file = form.get("image")
        if image_file and hasattr(image_file, "filename") and image_file.filename:
            ext = FilePath(image_file.filename).suffix.lower()
            if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
                ext = ".png"
            filename = f"prod_{uuid.uuid4().hex[:12]}{ext}"
            target_dir = STORAGE_DIRECTORY / "images" / "products"
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path = target_dir / filename
            content = await image_file.read()
            if len(content) > 0:
                with open(target_path, "wb") as f:
                    f.write(content)
                payload["image_url"] = f"/storage/images/products/{filename}"

        return payload
    else:
        return await request.json()


@app.post("/products", status_code=201)
async def create_product(request: Request):
    payload = await parse_product_payload(request)
    return forward_request("POST", "/products", json=payload)


@app.put("/products/{product_id}")
async def update_product(product_id: int, request: Request):
    payload = await parse_product_payload(request)
    return forward_request("PUT", f"/products/{product_id}", json=payload)


@app.delete("/products/{product_id}")
def delete_product(product_id: int):
    return forward_request("DELETE", f"/products/{product_id}")


# ---------------------- Orders ----------------------

@app.post("/orders", status_code=201)
def create_order(order: OrderCreateRequest):
    return forward_order_request(
        "POST",
        "/orders",
        json=order.model_dump(mode="json")
    )


@app.get("/orders")
def get_orders(
    status: OrderStatus | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500)
):
    params = {"skip": skip, "limit": limit}
    if status is not None:
        params["status"] = status.value

    return forward_order_request("GET", "/orders", params=params)


@app.get("/orders/{order_id}")
def get_order(order_id: int = Path(gt=0)):
    return forward_order_request("GET", f"/orders/{order_id}")


@app.patch("/orders/{order_id}/status")
def update_order_status(
    update: OrderStatusUpdate,
    order_id: int = Path(gt=0)
):
    return forward_order_request(
        "PATCH",
        f"/orders/{order_id}/status",
        json=update.model_dump(mode="json")
    )
