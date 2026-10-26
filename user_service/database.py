import os
import uuid

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from user_service.security import hash_password

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "shoe_store")

DATABASE_URL = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, echo=False)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def initialize_user_schema():
    from user_service.models import User

    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("users")}
    migrations = {
        "public_code": "ALTER TABLE users ADD COLUMN public_code VARCHAR(40) NULL",
        "username": "ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL",
        "password_hash": "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL",
        "role": (
            "ALTER TABLE users ADD COLUMN role VARCHAR(20) "
            "NOT NULL DEFAULT 'CUSTOMER'"
        ),
    }

    with engine.begin() as connection:
        for column, statement in migrations.items():
            if column not in columns:
                connection.execute(text(statement))

        legacy_users = connection.execute(
            text("""
                SELECT id
                FROM users
                WHERE public_code IS NULL OR username IS NULL OR password_hash IS NULL
            """)
        ).mappings().all()
        for user in legacy_users:
            connection.execute(
                text("""
                    UPDATE users
                    SET public_code = COALESCE(public_code, :public_code),
                        username = COALESCE(username, :username),
                        password_hash = COALESCE(password_hash, 'DISABLED')
                    WHERE id = :user_id
                """),
                {
                    "public_code": f"USR-{uuid.uuid4().hex.upper()}",
                    "username": f"legacy_{user['id']}",
                    "user_id": user["id"],
                },
            )

    inspector = inspect(engine)
    unique_columns = {
        tuple(constraint.get("column_names") or ())
        for constraint in inspector.get_unique_constraints("users")
    }
    unique_columns.update(
        tuple(index["column_names"])
        for index in inspector.get_indexes("users")
        if index.get("unique")
    )

    with engine.begin() as connection:
        for column, index_name in (
            ("public_code", "uq_users_public_code"),
            ("username", "uq_users_username"),
        ):
            if (column,) not in unique_columns:
                connection.execute(
                    text(f"CREATE UNIQUE INDEX {index_name} ON users ({column})")
                )

        for column, definition in (
            ("public_code", "VARCHAR(40) NOT NULL"),
            ("username", "VARCHAR(50) NOT NULL"),
            ("password_hash", "VARCHAR(255) NOT NULL"),
        ):
            connection.execute(
                text(f"ALTER TABLE users MODIFY COLUMN {column} {definition}")
            )

    bootstrap_username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "").strip().lower()
    bootstrap_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    if not bootstrap_username or not bootstrap_password:
        print(
            "Warning: BOOTSTRAP_ADMIN_USERNAME/PASSWORD are not set; "
            "create them in .env before using the admin frontend."
        )
        return
    if len(bootstrap_username) < 3 or len(bootstrap_username) > 50:
        raise RuntimeError("BOOTSTRAP_ADMIN_USERNAME must be 3-50 characters")
    if len(bootstrap_password) < 8 or len(bootstrap_password) > 128:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must be 8-128 characters")

    with SessionLocal() as db:
        existing = db.query(User).filter(User.username == bootstrap_username).first()
        if existing is not None:
            if existing.role != "ADMIN":
                raise RuntimeError(
                    "Bootstrap username already belongs to a non-admin account"
                )
            return

        admin = User(
            public_code=f"USR-{uuid.uuid4().hex.upper()}",
            full_name="System Administrator",
            username=bootstrap_username,
            password_hash=hash_password(bootstrap_password),
            role="ADMIN",
            email=f"{bootstrap_username}@users.example.com",
        )
        db.add(admin)
        db.commit()
