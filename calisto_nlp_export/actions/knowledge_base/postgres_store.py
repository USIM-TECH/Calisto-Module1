"""PostgreSQL-backed storage for the Calisto knowledge base."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from pgvector.psycopg import Vector, register_vector
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def build_database_url() -> str:
    explicit_url = os.getenv("KB_DATABASE_URL")
    if explicit_url:
        return explicit_url

    user = os.getenv("KB_DB_USER", "calisto")
    password = os.getenv("KB_DB_PASSWORD", "calisto")
    host = os.getenv("KB_DB_HOST", "localhost")
    port = os.getenv("KB_DB_PORT", "5432")
    database = os.getenv("KB_DB_NAME", "calisto_kb")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


EMBEDDING_DIMENSION = 384


SCHEMA_STATEMENTS = [
    "CREATE EXTENSION IF NOT EXISTS vector",
    """
    CREATE TABLE IF NOT EXISTS kb_products (
        product_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        product_name TEXT NOT NULL,
        price_myr DOUBLE PRECISION NOT NULL,
        store_location TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_orders (
        order_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        carrier TEXT NOT NULL,
        tracking TEXT NOT NULL,
        eta TEXT NOT NULL,
        step TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_stores (
        store_id BIGSERIAL PRIMARY KEY,
        city TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        hours TEXT NOT NULL,
        aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
        UNIQUE (city, name, address)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_city_redirects (
        alias TEXT PRIMARY KEY,
        city TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_prompts (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_responses (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_face_shape_styles (
        face_shape TEXT PRIMARY KEY,
        styles JSONB NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_documents (
        document_id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL,
        UNIQUE (source, ordinal)
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS kb_document_embeddings (
        embedding_id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding VECTOR({EMBEDDING_DIMENSION}) NOT NULL,
        ordinal INTEGER NOT NULL,
        UNIQUE (source, ordinal)
    )
    """,
]


class KnowledgeBaseStorage:
    """Loads Calisto KB data from PostgreSQL."""

    _instance: Optional["KnowledgeBaseStorage"] = None

    def __init__(self) -> None:
        self.database_url = build_database_url()
        self._initialise()

    @classmethod
    def get(cls) -> "KnowledgeBaseStorage":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _connect(self) -> psycopg.Connection:
        try:
            return psycopg.connect(self.database_url, row_factory=dict_row)
        except psycopg.Error as exc:
            raise RuntimeError(
                "Unable to connect to the PostgreSQL knowledge base. "
                "Set KB_DATABASE_URL or KB_DB_HOST/KB_DB_PORT/KB_DB_NAME/KB_DB_USER/KB_DB_PASSWORD."
            ) from exc

    def _connect_with_vector(self) -> psycopg.Connection:
        connection = self._connect()
        register_vector(connection)
        return connection

    def _initialise(self) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                for statement in SCHEMA_STATEMENTS:
                    cursor.execute(statement)
            connection.commit()

    def product_catalog_rows(self) -> List[Dict[str, Any]]:
        return self._fetch_all(
            """
            SELECT
                product_id AS "Product_ID",
                category AS "Category",
                product_name AS "Product_Name",
                price_myr AS "Price_MYR",
                store_location AS "Store_Location"
            FROM kb_products
            ORDER BY product_id
            """
        )

    def orders_payload(self) -> Dict[str, Dict[str, Any]]:
        rows = self._fetch_all(
            "SELECT order_id, status, carrier, tracking, eta, step FROM kb_orders ORDER BY order_id"
        )
        return {
            row["order_id"]: {
                "status": row["status"],
                "carrier": row["carrier"],
                "tracking": row["tracking"],
                "eta": row["eta"],
                "step": row["step"],
            }
            for row in rows
        }

    def store_locations_payload(self) -> Dict[str, Any]:
        stores = self._fetch_all(
            "SELECT city, name, address, phone, hours, aliases FROM kb_stores ORDER BY city, name"
        )
        redirects = self._fetch_all("SELECT alias, city FROM kb_city_redirects ORDER BY alias")
        return {
            "stores": stores,
            "city_redirects": {row["alias"]: row["city"] for row in redirects},
        }

    def conversation_payload(self) -> Dict[str, Any]:
        prompts = self._fetch_all("SELECT key, value FROM kb_prompts ORDER BY key")
        responses = self._fetch_all("SELECT key, value FROM kb_responses ORDER BY key")
        styles = self._fetch_all("SELECT face_shape, styles FROM kb_face_shape_styles ORDER BY face_shape")
        return {
            "prompts": {row["key"]: row["value"] for row in prompts},
            "responses": {row["key"]: row["value"] for row in responses},
            "face_shape_styles": {row["face_shape"]: row["styles"] for row in styles},
        }

    def document_rows(self) -> List[Tuple[str, str]]:
        rows = self._fetch_all(
            "SELECT source, content FROM kb_documents ORDER BY source, ordinal, document_id"
        )
        return [(row["source"], row["content"]) for row in rows]

    def replace_document_embeddings(
        self,
        chunks: List[Tuple[str, str]],
        embeddings: List[List[float]],
    ) -> int:
        if len(chunks) != len(embeddings):
            raise ValueError("Chunk and embedding counts must match")

        with self._connect_with_vector() as connection:
            with connection.cursor() as cursor:
                cursor.execute("TRUNCATE kb_document_embeddings RESTART IDENTITY")
                cursor.executemany(
                    """
                    INSERT INTO kb_document_embeddings (source, text, embedding, ordinal)
                    VALUES (%s, %s, %s, %s)
                    """,
                    [
                        (source, text, Vector(embedding), ordinal)
                        for ordinal, ((source, text), embedding) in enumerate(zip(chunks, embeddings))
                    ],
                )
            connection.commit()

        return len(chunks)

    def search_document_embeddings(
        self,
        query_embedding: List[float],
        top_k: int = 3,
    ) -> List[Dict[str, Any]]:
        with self._connect_with_vector() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        source,
                        text,
                        1 - (embedding <=> %s) AS score
                    FROM kb_document_embeddings
                    ORDER BY embedding <=> %s
                    LIMIT %s
                    """,
                    (Vector(query_embedding), Vector(query_embedding), top_k),
                )
                return list(cursor.fetchall())

    def _fetch_all(self, query: str) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(query)
                return list(cursor.fetchall())