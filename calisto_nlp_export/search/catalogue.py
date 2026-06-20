import re
from typing import Any, Dict, List
import pandas as pd
from gateway.service_gateway import gateway
from config.constants import PRODUCT_FIELD_ALIASES

def normalize_product_record(product: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(product)
    for source_key, target_key in PRODUCT_FIELD_ALIASES.items():
        if target_key not in normalized and source_key in normalized:
            normalized[target_key] = normalized[source_key]
    return normalized

def load_catalogue() -> pd.DataFrame:
    """Load product catalogue from the remote DB-backed integration API."""
    if not gateway.enabled():
        raise RuntimeError(
            "BACKEND_API_BASE_URL is not set. Product catalogue is only available via the integration API (Postgres)."
        )
    remote_products: Any = gateway.list_products()
    if isinstance(remote_products, list):
        if len(remote_products) == 0:
            df = pd.DataFrame(columns=["brand", "product_name", "product_type", "category", "frame_material", "frame_shape", "frame_color", "price_myr", "gender", "use_case", "uv_protection", "polarized", "lens_color", "lens_type", "lens_feature", "lens_duration", "multifocal"])
        elif all(isinstance(p, dict) for p in remote_products):
            df = pd.DataFrame([normalize_product_record(p) for p in remote_products]).fillna("")
            if "price_myr" in df.columns:
                df["price_myr"] = pd.to_numeric(df["price_myr"], errors="coerce")
        else:
            raise RuntimeError("Remote product catalogue returned invalid product records.")
    else:
        raise RuntimeError(
            "Remote product catalogue unavailable. "
            "Set BACKEND_API_BASE_URL to the integration API and ensure it is using STORAGE_BACKEND=postgres."
        )

    # Normalize common string fields early so downstream filtering is stable.
    for col in ["brand", "product_name", "product_type", "category", "frame_material", "frame_shape", "frame_color"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    if "price_myr" in df.columns:
        df["price_myr"] = pd.to_numeric(df["price_myr"], errors="coerce")

    # Fix mixed/fake brands in the sample catalogue.
    # Frames/sunglasses product names follow: "<Brand> Premium Frame <n>" / "<Brand> Luxe Sunglasses <n>".
    if "product_name" in df.columns and "brand" in df.columns:
        extracted = df["product_name"].astype(str).str.extract(
            r"^(?P<brand>.+?)\s+(?:Premium Frame|Luxe Sunglasses)\s+\d+\s*$",
            flags=re.IGNORECASE,
        )
        extracted_brand = extracted["brand"].fillna("").astype(str).str.strip()
        mask = extracted_brand.astype(bool)
        if mask.any():
            df.loc[mask, "brand"] = extracted_brand[mask]

        # Normalize any concatenated brand strings and strip duplicate brand prefixes in names.
        def _clean_brand(value: str) -> str:
            parts = re.split(r"\s*[-/]\s*", value or "")
            return parts[0].strip() if parts else str(value or "").strip()

        def _clean_product_name(name: str, brand_value: str) -> str:
            cleaned = str(name or "").strip()
            if " - " in cleaned:
                segments = [seg.strip() for seg in cleaned.split(" - ") if seg.strip()]
                if len(segments) > 1:
                    cleaned = " ".join(segments[1:])
            if brand_value and cleaned.lower().startswith(brand_value.lower()):
                cleaned = cleaned[len(brand_value):].strip(" -")
            return cleaned or str(name or "").strip()

        df["brand"] = df["brand"].astype(str).apply(_clean_brand)
        df["product_name"] = [
            _clean_product_name(name, brand)
            for name, brand in zip(df["product_name"].tolist(), df["brand"].tolist())
        ]

    return df
