from typing import Optional
import pandas as pd

def titleize(value: Optional[str]) -> str:
    return str(value or "").strip().title()

def format_product(row: pd.Series) -> str:
    brand = row.get("brand") or "Unknown Brand"
    name = row.get("product_name") or "Unknown Product"
    price = row.get("price_myr")
    city = row.get("city") or ""
    store = row.get("store_location") or ""
    suffix = f"\nLocation: {store}, {city}".rstrip(", ")
    return f"{brand} - {name}\nPrice: RM{float(price):.2f}{suffix}"

def format_product_list(rows: pd.DataFrame, heading: str) -> str:
    lines = [heading, ""]
    for index, (_, row) in enumerate(rows.iterrows(), start=1):
        brand = titleize(row.get("brand")) or "Calisto"
        product_name = str(row.get("product_name") or "Frame").strip()
        location_parts = [str(row.get("store_location") or "").strip(), str(row.get("city") or "").strip()]
        location = ", ".join(part for part in location_parts if part)
        lines.append(f"{index}. {brand} - {product_name}")
        lines.append(f"Price: RM{float(row.get('price_myr', 0) or 0):.2f}")
        if location:
            lines.append(f"Location: {location}")
        lines.append("")
    return "\n".join(lines).strip()
