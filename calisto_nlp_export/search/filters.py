import logging
from typing import Any, Dict, Optional
import pandas as pd
from rasa_sdk import Tracker
from nlp.budget_parser import parse_budget_from_text

logger = logging.getLogger(__name__)

def filter_by_budget(
    df: pd.DataFrame,
    budget_slot: str,
    tracker: Optional[Tracker] = None,
    overrides: Optional[Dict[str, Any]] = None,
) -> pd.DataFrame:
    """Apply HARD budget filter. Budget constraints are applied BEFORE ranking."""
    if "price_myr" not in df.columns:
        return df

    b_min: Optional[float] = None
    b_max: Optional[float] = None
    b_bucket: Optional[str] = None

    # 1. Prefer explicit overrides (from pre-parsed query)
    if overrides:
        try:
            if overrides.get("budget_min") is not None:
                b_min = float(overrides.get("budget_min"))
        except (TypeError, ValueError):
            pass
        try:
            if overrides.get("budget_max") is not None:
                b_max = float(overrides.get("budget_max"))
        except (TypeError, ValueError):
            pass
        if overrides.get("budget_bucket"):
            b_bucket = str(overrides.get("budget_bucket"))

    # 2. Prefer explicit numeric slots (from integration layer opportunistic fill)
    if tracker and b_min is None and b_max is None and not b_bucket:
        raw_min = tracker.get_slot("budget_min")
        raw_max = tracker.get_slot("budget_max")
        raw_bucket = tracker.get_slot("budget_bucket")
        if raw_min is not None:
            try:
                b_min = float(raw_min)
            except (TypeError, ValueError):
                pass
        if raw_max is not None:
            try:
                b_max = float(raw_max)
            except (TypeError, ValueError):
                pass
        if raw_bucket:
            b_bucket = str(raw_bucket)

    # 3. Fall back to parsing the budget string slot
    if b_min is None and b_max is None and not b_bucket and budget_slot:
        budget_text = str(budget_slot).strip()
        budget_lower = budget_text.lower().replace(" ", "").replace("–", "-")
        if "underrm100" in budget_lower or "belowrm100" in budget_lower:
            b_max = 100.0
        elif "rm100-rm250" in budget_lower or "rm100rm250" in budget_lower:
            b_min, b_max = 100.0, 250.0
        elif "rm250-rm300" in budget_lower or "rm250rm300" in budget_lower:
            b_min, b_max = 250.0, 300.0
        elif "aboverm300" in budget_lower:
            b_min = 300.0
        else:
            parsed = parse_budget_from_text(budget_text)
            if parsed:
                b_min = parsed.get("budget_min")
                b_max = parsed.get("budget_max")
                b_bucket = parsed.get("budget_bucket")

    # 4. Also try parsing the raw message text if still no budget
    if b_min is None and b_max is None and not b_bucket and tracker:
        msg_text = tracker.latest_message.get("text") or ""
        parsed = parse_budget_from_text(msg_text)
        if parsed:
            b_min = parsed.get("budget_min")
            b_max = parsed.get("budget_max")
            b_bucket = parsed.get("budget_bucket")

    # Apply HARD filters
    filtered = df
    if b_min is not None or b_max is not None:
        if b_min is not None:
            filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
            filtered = filtered[filtered["price_myr"] >= b_min]
        if b_max is not None:
            filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
            filtered = filtered[filtered["price_myr"] <= b_max]
    else:
        if b_bucket == "low":
            filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
            filtered = filtered[filtered["price_myr"] <= 150]
        elif b_bucket == "premium":
            filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
            filtered = filtered[filtered["price_myr"] >= 700]

    logger.info(
        "[BUDGET] min=%s max=%s bucket=%s → %d/%d products remain",
        b_min, b_max, b_bucket, len(filtered), len(df)
    )
    return filtered

import re

def _lens_feature_match(series: pd.Series, requested: str) -> pd.Series:
    requested_text = str(requested or "").strip()
    requested_lower = requested_text.lower()
    if "blue light" in requested_lower:
        return series.astype(str).str.contains("blue light", case=False, na=False)
    return series.astype(str).str.contains(re.escape(requested_text), case=False, na=False)

def _yes_no_match(series: pd.Series, requested: str) -> pd.Series:
    expected = str(requested or "").strip().lower()
    if expected in {"true", "1", "y"}:
        expected = "yes"
    if expected in {"false", "0", "n"}:
        expected = "no"
    return series.astype(str).str.strip().str.lower().isin({expected})
