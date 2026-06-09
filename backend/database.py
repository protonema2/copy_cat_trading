from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

def create_sqlite_engine(sqlite_url: str):
    return create_engine(
        sqlite_url,
        echo=True,
        future=True,
        connect_args={"check_same_thread": False},
    )

if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./copycat_trading.db"
    print("No DATABASE_URL found; using SQLite fallback:", DATABASE_URL)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

try:
    if DATABASE_URL.startswith("sqlite://"):
        engine = create_sqlite_engine(DATABASE_URL)
    else:
        engine = create_engine(DATABASE_URL, echo=True, future=True)
        with engine.connect() as conn:
            pass
except Exception as exc:
    print(f"WARNING: Could not connect to database at {DATABASE_URL}: {exc}")
    DATABASE_URL = "sqlite:///./copycat_trading.db"
    print("Falling back to SQLite:", DATABASE_URL)
    engine = create_sqlite_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
