import os

# Base API Configuration
BACKEND_API_BASE_URL = os.getenv("BACKEND_API_BASE_URL", "").rstrip("/")
BACKEND_API_KEY = os.getenv("BACKEND_API_KEY", "")

# App defaults
BOOKING_URL = os.getenv("BOOKING_URL", "").strip()
DEFAULT_STORE_HOURS = os.getenv("DEFAULT_STORE_HOURS", "10:00 AM to 10:00 PM daily").strip()
INTENT_CONFIDENCE_THRESHOLD = 0.7

# Persistent slots (not cleared between flows)
PERSISTENT_SLOTS = {
    "lead_name",
    "contact_number",
    "email",
    "lead_location",
    "preferred_service",
    "purchase_timeline",
    "lead_status",
}

# Slots managed by the state machine
MANAGED_SLOTS = {
    "product_type",
    "brand",
    "price_range",
    "lens_type",
    "city",
    "use_case",
    "urgency",
    "order_id",
    "frame_color",
    "frame_shape",
    "frame_material",
    "uv_protection",
    "polarized",
    "lens_color",
    "lens_feature",
    "lens_duration",
    "multifocal",
    "budget",
    "budget_min",
    "budget_max",
    "budget_bucket",
    "gender",
    "price_modifier",
    *PERSISTENT_SLOTS,
}

# Intents that can interrupt form filling
FORM_INTERRUPTION_INTENTS = {
    "greet",
    "ask_faq",
    "ask_a_question",
    "support_and_policies",
    "ask_pricing",
    "select_pricing_category",
    "browse_eyewear",
    "select_product_type",
    "select_brand",
    "select_budget",
    "ask_lens_type",
    "lens_vision_solutions",
    "find_a_store",
    "store_hours",
    "choose_city",
    "search_product",
    "search_product_by_attribute",
    "product_recommendation",
    "inform_budget",
    "email_support",
    "after_sales_support",
    "order_tracking",
    "order_support",
    "return_request",
    "refund_request",
    "exchange_request",
    "warranty_support",
    "repair_support",
    "human_handoff",
}

# Mapping from intent to general flow name
FLOW_BY_INTENT = {
    "ask_faq": "faq",
    "ask_pricing": "pricing",
    "select_pricing_category": "pricing",
    "browse_eyewear": "browse_eyewear",
    "select_product_type": "browse_eyewear",
    "select_brand": "browse_eyewear",
    "select_budget": "browse_eyewear",
    "ask_lens_type": "lens_consultation",
    "lens_vision_solutions": "lens_consultation",
    "find_a_store": "store_lookup",
    "store_hours": "store_lookup",
    "choose_city": "store_lookup",
    "search_product": "product_search",
    "search_product_by_attribute": "product_search",
    "product_recommendation": "product_recommendation",
    "inform_budget": "product_search",
}

# Slots allowed per flow, to clean up unrelated context
FLOW_ALLOWED_SLOTS = {
    "faq": set(),
    "pricing": set(),
    "browse_eyewear": {
        "product_type",
        "brand",
        "price_range",
        "frame_color",
        "frame_shape",
        "frame_material",
        "uv_protection",
        "polarized",
        "lens_color",
        "lens_type",
        "lens_feature",
        "lens_duration",
        "multifocal",
        "budget",
        "budget_min",
        "budget_max",
        "budget_bucket",
        "gender",
        "price_modifier",
    },
    "lens_consultation": {"lens_type", "lens_feature", "uv_protection", "polarized", "lens_color", "lens_duration", "multifocal", "price_range"},
    "store_lookup": {"city"},
    "product_search": {
        "product_type",
        "brand",
        "price_range",
        "frame_color",
        "frame_shape",
        "frame_material",
        "uv_protection",
        "polarized",
        "lens_color",
        "lens_type",
        "lens_feature",
        "lens_duration",
        "multifocal",
        "budget",
        "budget_min",
        "budget_max",
        "budget_bucket",
        "use_case",
        "gender",
        "price_modifier",
    },
    "product_recommendation": {"product_type", "brand", "budget", "use_case", "urgency", "gender", "uv_protection", "polarized", "lens_color", "lens_type", "lens_feature", "lens_duration", "multifocal"},
    "lead_capture": set(PERSISTENT_SLOTS),
}
