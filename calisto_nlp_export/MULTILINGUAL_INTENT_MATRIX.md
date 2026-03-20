# Multilingual Intent Coverage Matrix

This file tracks whether each major intent has enough coverage to behave similarly across:

- `en` English
- `ms` Malay
- `zh` Mandarin

Status guide:

- `good`: strong example coverage and localized responses/actions
- `partial`: basic support exists but still weaker than English
- `needs_work`: present but not balanced enough for production confidence

## Core Journeys

| Intent | Purpose | en | ms | zh | Notes |
|---|---|---:|---:|---:|---|
| `greet` | Open conversation | good | good | good | Localized responses + training examples |
| `browse_eyewear` | Start product browsing | good | good | good | Good top-level coverage |
| `ask_pricing` | Pricing questions | good | good | good | Common pricing phrases covered |
| `find_a_store` | Store/outlet search | good | good | good | Includes KL / city / mall variants |
| `store_hours` | Store opening hours | good | partial | partial | Needs more mall/location-specific variants |
| `book_appointment` | Appointment booking | good | good | good | Main booking variants covered |
| `reschedule_appointment` | Change an appointment | good | partial | partial | More natural variants still needed |
| `after_sales_support` | General post-purchase help | good | good | good | Core issues covered |
| `order_tracking` | Track order status | good | partial | partial | More multilingual order-id phrasing recommended |
| `warranty_claim` | Warranty issue/claim | good | partial | partial | Good starter set, still lighter than English |
| `human_handoff` | Ask for a human | good | good | good | Strong enough for first pass |

## Product Discovery

| Intent | Purpose | en | ms | zh | Notes |
|---|---|---:|---:|---:|---|
| `search_product` | Product search with brand/budget/type | good | partial | partial | English still far richer |
| `search_product_by_attribute` | Color/shape/material search | good | needs_work | needs_work | Needs parallel multilingual phrasing |
| `product_recommendation` | Recommend by use case | good | partial | partial | Good base, needs more natural variants |
| `lens_vision_solutions` | Enter lens help flow | good | partial | partial | More localized natural phrasing needed |
| `ask_lens_type` | Ask about a lens type | good | needs_work | needs_work | Mostly English phrasing today |
| `select_product_type` | Button + text product type | good | partial | partial | Mostly button-driven outside English |
| `select_brand` | Brand selection | good | partial | partial | Mostly English + proper nouns |
| `select_budget` | Budget selection | good | partial | partial | Works well with buttons |
| `inform_budget` | Free-text budget values | good | needs_work | needs_work | Still English-heavy |

## Lead Capture

| Intent | Purpose | en | ms | zh | Notes |
|---|---|---:|---:|---:|---|
| `capture_lead` | Start contact capture | good | partial | partial | Starter multilingual phrasing added |
| `share_name` | Share person name | good | good | good | Needs more natural real-name patterns later |
| `share_phone` | Share phone number | good | good | good | Core examples present |
| `share_email` | Share email address | good | good | good | Core examples present |
| `share_location` | Share city/area | good | good | good | Basic multilingual support |
| `share_service_interest` | Share service interest | good | partial | partial | Needs more language-specific natural phrases |
| `share_timeline` | Share decision timeline | good | partial | partial | Needs more multilingual natural variants |

## FAQ / Generic

| Intent | Purpose | en | ms | zh | Notes |
|---|---|---:|---:|---:|---|
| `ask_faq` | FAQ / policy questions | good | partial | partial | English still much broader |
| `affirm` | Confirmation | good | good | good | Basic conversational support |
| `deny` | Rejection | good | good | good | Basic conversational support |

## Canonical Entity Mapping

These should resolve to one internal value regardless of language:

### Cities / Locations

- `Kuala Lumpur`
  - `KL`
  - `吉隆坡`
- `Bukit Bintang`
  - `武吉免登`
- `Lalaport Bukit Bintang`
  - `Lalaport`
- `Aeon Mall Nilai`
  - `Aeon Nilai`

### Product Types

- `Designer Frames`
  - `glasses`
  - `frames`
  - `eyeglasses`
  - `spectacles`
  - `bingkai`
  - `cermin mata`
  - `镜框`
  - `眼镜框`
- `Luxury Sunglasses`
  - `sunglasses`
  - `shades`
  - `cermin mata hitam`
  - `太阳镜`
- `Contact Lenses`
  - `contacts`
  - `contact lens`
  - `contact lenses`
  - `kanta sentuh`
  - `隐形眼镜`

### Services

- `Eyewear Recommendation`
  - `cadangan produk`
  - `产品推荐`
- `Lens Consultation`
  - `konsultasi kanta`
  - `镜片咨询`
- `Store Visit`
  - `lawatan kedai`
  - `到店服务`
- `After-sales Support`
  - `sokongan selepas jualan`
  - `售后支持`

## What To Improve Next

1. Raise `partial` and `needs_work` intents to balanced example counts across all three languages.
2. Add multilingual edge-case prompts:
   - short
   - typo-like
   - mixed-intent
   - entity-heavy
3. Add multilingual evaluation samples with expected intent + expected entity extraction.
4. Review fallback behavior in Malay and Mandarin when confidence is low.
