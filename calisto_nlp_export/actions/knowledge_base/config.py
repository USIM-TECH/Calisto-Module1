"""
Calisto Eyewear – RAG Pipeline Configuration
Configurable synonyms, domain vocabulary, entity patterns, and intent-document mapping.
"""

# ── 1. SYNONYM DICTIONARY ──────────────────────────────────
# Maps base terms to lists of synonyms for query expansion.
SYNONYM_MAP = {
    # Eyewear terms
    "glasses": ["eyewear", "spectacles", "specs", "frames", "cermin mata"],
    "sunglasses": ["shades", "sunnies", "sun glasses", "cermin mata hitam"],
    "frames": ["eyeglass frames", "spectacle frames", "frame"],
    "lenses": ["lens", "kanta"],
    "progressive": ["multifocal", "varifocal", "progressive lenses"],
    "bifocal": ["bifocals", "bi-focal"],
    "blue light": ["blue light blocking", "computer glasses", "anti blue ray", "screen glasses"],
    "polarized": ["polarised", "anti-glare polarized"],
    "photochromic": ["transitions", "auto-darkening", "auto tint"],

    # Price terms
    "cheap": ["affordable", "low cost", "budget", "murah", "bajet"],
    "expensive": ["premium", "luxury", "high end", "mahal"],
    "price": ["cost", "harga", "pricing", "how much", "berapa"],
    "discount": ["promo", "offer", "sale", "diskaun"],

    # Store/location terms
    "store": ["shop", "outlet", "branch", "kedai", "cawangan"],
    "location": ["address", "alamat", "where", "di mana", "kat mana"],

    # Service terms
    "eye test": ["eye exam", "vision test", "eye check", "pemeriksaan mata"],
    "warranty": ["guarantee", "jaminan", "waranti"],
    "return": ["exchange", "refund", "pulang", "tukar"],

    # Brand
    "calisto": ["calisto eyewear"],

    # Malaysian terms
    "kedai": ["store", "shop"],
    "cermin mata": ["glasses", "eyewear", "spectacles"],
    "murah": ["cheap", "affordable", "budget"],
    "mahal": ["expensive", "premium"],
}

# ── 2. DOMAIN VOCABULARY ───────────────────────────────────
# Custom dictionary of terms that MUST NOT be auto-corrected.
# Spell correction will learn these and prefer them.
DOMAIN_VOCABULARY = [
    # Brand & company
    "calisto", "eyewear",
    # Products
    "sunglasses", "spectacles", "eyeglasses", "frames", "lenses",
    "progressive", "bifocal", "photochromic", "transitions",
    "polarized", "polarised", "anti-glare", "blue light",
    "single vision", "reading glasses", "computer glasses",
    "sports glasses", "aviator", "wayfarer", "cat-eye",
    "rectangular", "oval", "round", "rimless",
    # Lens features
    "uv400", "anti-reflective", "scratch resistant",
    "hydrophobic", "oleophobic",
    # Malaysian locations
    "kuala lumpur", "petaling jaya", "subang jaya", "shah alam",
    "penang", "georgetown", "johor bahru", "ipoh", "melaka",
    "kota kinabalu", "kuching", "selangor", "pavilion",
    "mid valley", "one utama", "sunway pyramid", "gurney plaza",
    "southkey", "bukit bintang", "lalaport",
    # Malaysia-specific
    "ringgit", "rm",
    # Common Manglish
    "nak", "kat", "boleh", "ada", "mana", "harga", "kedai",
    "cermin mata", "berapa", "murah", "mahal",
]

# ── 3. INTENT → DOCUMENT SOURCE MAPPING ────────────────────
# When an intent is detected with high confidence, prioritize
# searching within these specific document sources.
INTENT_SOURCE_MAP = {
    "ask_store_location": ["company_profile_calisto.pdf"],
    "ask_product_info": ["product_catalog_calisto.csv", "product_categories_calisto.docx"],
    "ask_product": ["product_catalog_calisto.csv", "product_categories_calisto.docx"],
    "search_frames": ["product_catalog_calisto.csv", "product_categories_calisto.docx"],
    "ask_lens_price": ["product_catalog_calisto.csv"],
    "ask_lens_types": ["product_categories_calisto.docx"],
    "ask_company_info": ["company_profile_calisto.pdf", "marketing_materials_calisto.docx"],
    "ask_services": ["services_corporate_calisto.docx"],
    "ask_warranty": ["faq_customer_support_calisto.docx"],
    "ask_return_exchange": ["faq_customer_support_calisto.docx"],
    "ask_payment_options": ["faq_customer_support_calisto.docx"],
}

# Minimum intent confidence to trigger source filtering
INTENT_CONFIDENCE_THRESHOLD = 0.6

# ── 4. PRICE/NUMBER NORMALIZATION MAP ──────────────────────
# Phrases that indicate a price query are normalized.
PRICE_PHRASES = {
    "how much": "price",
    "how much is": "price",
    "how much does": "price",
    "what is the cost": "price",
    "what is the price": "price",
    "berapa harga": "price",
    "berapa": "price",
    "cost of": "price",
    "pricing for": "price",
    "pricing of": "price",
}

# ── 5. ENTITY BOOST PATTERNS ───────────────────────────────
# Regex patterns for simple entity detection to boost queries.
ENTITY_PATTERNS = {
    "location": [
        r"\b(?:kuala lumpur|kl|petaling jaya|pj|subang|shah alam|penang|"
        r"georgetown|johor bahru|jb|ipoh|melaka|kota kinabalu|kk|kuching)\b"
    ],
    "product": [
        r"\b(?:sunglasses|glasses|spectacles|frames|eyeglasses|lenses|"
        r"cermin mata|progressive|bifocal|blue light|polarized|photochromic|"
        r"aviator|wayfarer|cat-eye|reading glasses|sports glasses)\b"
    ],
    "service": [
        r"\b(?:eye test|eye exam|warranty|return|exchange|refund|"
        r"pemeriksaan mata|jaminan|booking|appointment)\b"
    ],
    "price": [
        r"\b(?:price|cost|cheap|expensive|affordable|budget|rm\s*\d+|"
        r"harga|murah|mahal|discount|promo)\b"
    ],
}

# ── 6. HYBRID SEARCH WEIGHTS ───────────────────────────────
ALPHA_EMBEDDING = 0.65   # Weight for FAISS cosine similarity
BETA_BM25 = 0.35         # Weight for BM25 keyword relevance

# ── 7. RETRIEVAL SETTINGS ──────────────────────────────────
TOP_K_RETRIEVAL = 10     # Retrieve this many from each method
TOP_K_FINAL = 3          # Return this many after re-ranking
RELEVANCE_THRESHOLD = 0.20  # Minimum final score to keep
