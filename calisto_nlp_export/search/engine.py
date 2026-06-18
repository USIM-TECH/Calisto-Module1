import logging
from typing import Any
import pandas as pd

logger = logging.getLogger(__name__)

def rank_products_safely(
    df: pd.DataFrame,
    product_type: Any = None,
    brand: Any = None,
    use_case: Any = None,
) -> pd.DataFrame:
    try:
        ranked = df.copy()
        if ranked.empty:
            return ranked

        score = pd.Series(0.0, index=ranked.index)
        if product_type:
            product_type_text = str(product_type)
            score += ranked["product_type"].astype(str).str.contains(product_type_text, case=False, na=False).astype(float) * 4
            score += ranked["category"].astype(str).str.contains(product_type_text, case=False, na=False).astype(float) * 2
        if brand:
            score += ranked["brand"].astype(str).str.contains(str(brand), case=False, na=False).astype(float) * 3
        if use_case:
            use_case_text = str(use_case)
            relevance = (
                ranked["description"].astype(str).str.contains(use_case_text, case=False, na=False)
                | ranked["product_name"].astype(str).str.contains(use_case_text, case=False, na=False)
                | ranked["lens_feature"].astype(str).str.contains(use_case_text, case=False, na=False)
            )
            score += relevance.astype(float) * 2
        if "stock_status" in ranked.columns:
            stock = ranked["stock_status"].astype(str).str.lower()
            score += stock.eq("in_stock").astype(float) * 2
            score += stock.eq("low_stock").astype(float)
        if "rating" in ranked.columns:
            rating = pd.to_numeric(ranked["rating"], errors="coerce").fillna(0)
            score += rating / 5

        ranked = ranked.assign(_score=score)
        sort_columns = ["_score"]
        ascending = [False]
        if "price_myr" in ranked.columns:
            sort_columns.append("price_myr")
            ascending.append(True)
        return ranked.sort_values(sort_columns, ascending=ascending).drop(columns=["_score"], errors="ignore")
    except Exception as exc:
        logger.warning("Product ranking failed, falling back to catalogue order: %s", exc)
        return df
