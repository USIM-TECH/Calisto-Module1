import pytest
from nlp.canonicalizer import canonical_text_key, canonicalize_slot_value, canonicalize_entities

def test_canonical_text_key():
    assert canonical_text_key("Single Vision") == "single vision"
    assert canonical_text_key("Blue-light lenses!") == "blue light lenses"

def test_canonicalize_slot_value():
    assert canonicalize_slot_value("lens_type", "single vision") == "Single Vision Lenses"
    assert canonicalize_slot_value("lens_type", "blue light protection") == "Blue Light Protection"
    assert canonicalize_slot_value("product_type", "sunglasses") == "Sunglasses"
    assert canonicalize_slot_value("product_type", "shades") == "Sunglasses"
    assert canonicalize_slot_value("preferred_service", "store visit") == "Store Visit"
    
    # Non-mapped value returns as is
    assert canonicalize_slot_value("product_type", "unknown type") == "unknown type"

def test_canonicalize_entities():
    entities = {
        "lens_type": "progressive lenses",
        "product_type": "cermin mata hitam",
        "unmapped_entity": "random value"
    }
    canonicalized = canonicalize_entities(entities)
    assert canonicalized["lens_type"] == "Progressive Lenses"
    assert canonicalized["product_type"] == "Sunglasses"
    assert canonicalized["unmapped_entity"] == "random value"
