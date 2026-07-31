import logging
from typing import Any
import pandas as pd

logger = logging.getLogger(__name__)

def rank_products_safely(
    df: pd.DataFrame,
    product_type: Any = None,
    brand: Any = None,
    use_case: Any = None,
    frame_color: Any = None,
    lens_type: Any = None,
    frame_shape: Any = None,
    price_modifier: Any = None,
) -> pd.DataFrame:
    try:
        ranked = df.copy()
        if ranked.empty:
            return ranked

        # Compute score for each row
        score = pd.Series(0.0, index=ranked.index)
        
        # 1. Exact brand match > fuzzy brand match
        if brand:
            brand_str = str(brand).strip().lower()
            exact_brand = ranked["brand"].astype(str).str.strip().str.lower() == brand_str
            fuzzy_brand = ranked["brand"].astype(str).str.contains(brand_str, case=False, na=False)
            score += exact_brand.astype(float) * 1000000.0
            score += (~exact_brand & fuzzy_brand).astype(float) * 500000.0

        # 2. Exact product type match > fuzzy product type match
        if product_type:
            pt_str = str(product_type).strip().lower()
            exact_pt = ranked["product_type"].astype(str).str.strip().str.lower() == pt_str
            fuzzy_pt = ranked["product_type"].astype(str).str.contains(pt_str, case=False, na=False)
            cat_pt = ranked["category"].astype(str).str.contains(pt_str, case=False, na=False) if "category" in ranked.columns else pd.Series(False, index=ranked.index)
            score += exact_pt.astype(float) * 100000.0
            score += (~exact_pt & (fuzzy_pt | cat_pt)).astype(float) * 50000.0

        # 3. Color match (frame_color or lens_color)
        if frame_color:
            color_str = str(frame_color).strip().lower()
            fc_match = ranked["frame_color"].astype(str).str.strip().str.lower() == color_str if "frame_color" in ranked.columns else pd.Series(False, index=ranked.index)
            lc_match = ranked["lens_color"].astype(str).str.strip().str.lower() == color_str if "lens_color" in ranked.columns else pd.Series(False, index=ranked.index)
            score += (fc_match | lc_match).astype(float) * 10000.0

        # 4. Lens type match
        if lens_type:
            lt_str = str(lens_type).strip().lower()
            lt_match = ranked["lens_type"].astype(str).str.contains(lt_str, case=False, na=False) if "lens_type" in ranked.columns else pd.Series(False, index=ranked.index)
            score += lt_match.astype(float) * 1000.0

        # 5. Shape match (frame_shape)
        if frame_shape:
            shape_str = str(frame_shape).strip().lower()
            shape_match = ranked["frame_shape"].astype(str).str.strip().str.lower() == shape_str if "frame_shape" in ranked.columns else pd.Series(False, index=ranked.index)
            score += shape_match.astype(float) * 100.0

        # 6. Price modifier / budget match
        if price_modifier:
            pm_str = str(price_modifier).strip().lower()
            if "price_myr" in ranked.columns:
                prices = pd.to_numeric(ranked["price_myr"], errors="coerce").fillna(0)
                if pm_str in ("cheaper", "budget", "affordable"):
                    max_price = prices.max() if prices.max() > 0 else 1.0
                    score += (1.0 - prices / max_price).astype(float) * 10.0
                elif pm_str in ("expensive", "premium", "luxury"):
                    max_price = prices.max() if prices.max() > 0 else 1.0
                    score += (prices / max_price).astype(float) * 10.0
            else:
                score += 10.0

        if use_case:
            use_case_text = str(use_case)
            relevance = (
                ranked["description"].astype(str).str.contains(use_case_text, case=False, na=False) if "description" in ranked.columns else pd.Series(False, index=ranked.index)
            ) | (
                ranked["product_name"].astype(str).str.contains(use_case_text, case=False, na=False) if "product_name" in ranked.columns else pd.Series(False, index=ranked.index)
            ) | (
                ranked["lens_feature"].astype(str).str.contains(use_case_text, case=False, na=False) if "lens_feature" in ranked.columns else pd.Series(False, index=ranked.index)
            )
            score += relevance.astype(float) * 5.0

        # Stock & Rating as final tie-breakers
        if "stock_status" in ranked.columns:
            stock = ranked["stock_status"].astype(str).str.lower()
            score += stock.eq("in_stock").astype(float) * 2.0
            score += stock.eq("low_stock").astype(float) * 1.0
            
        if "rating" in ranked.columns:
            rating = pd.to_numeric(ranked["rating"], errors="coerce").fillna(0)
            score += (rating / 5.0) * 1.0

        ranked = ranked.assign(_score=score)
        sort_columns = ["_score"]
        ascending = [False]
        if "price_myr" in ranked.columns:
            sort_columns.append("price_myr")
            if price_modifier and str(price_modifier).strip().lower() in ("expensive", "premium", "luxury"):
                ascending.append(False)
            else:
                ascending.append(True)

        return ranked.sort_values(sort_columns, ascending=ascending).drop(columns=["_score"], errors="ignore")
    except Exception as exc:
        logger.warning("Product ranking failed, falling back to catalogue order: %s", exc)
        return df
