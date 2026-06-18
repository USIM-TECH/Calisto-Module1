import pytest
from unittest.mock import patch
from nlp.city_resolver import resolve_city, normalize_city_key, is_probable_location, city_key_registry

@pytest.fixture(autouse=True)
def mock_registry():
    # Clear cache before each test
    city_key_registry.cache_clear()
    with patch("actions.utils.unique_cities", return_value=["Kuala Lumpur", "Johor Bahru", "Penang", "Petaling Jaya", "Ipoh"]):
        with patch("search.catalogue.load_catalogue", return_value=None):
            yield

def test_normalize_city_key():
    assert normalize_city_key("Kuala Lumpur") == "kuala lumpur"
    assert normalize_city_key(" Kuala  Lumpur ") == "kuala lumpur"
    assert normalize_city_key("Johor (Bahru)") == "johor bahru"

def test_resolve_city_direct():
    assert resolve_city("Kuala Lumpur") == "Kuala Lumpur"
    assert resolve_city("Johor Bahru") == "Johor Bahru"

def test_resolve_city_aliases():
    assert resolve_city("KL") == "Kuala Lumpur"
    assert resolve_city("JB") == "Johor Bahru"
    assert resolve_city("PJ") == "Petaling Jaya"
    assert resolve_city("Georgetown") == "Penang"

def test_resolve_city_embedded():
    # 'kl' is skipped for embedded matches because len("kl") < 3
    assert resolve_city("I'm in KL right now") is None
    assert resolve_city("looking for a store in johor bahru") == "Johor Bahru"

def test_resolve_city_unknown():
    assert resolve_city("Tokyo") is None
    assert resolve_city("Unknown City") is None

def test_is_probable_location():
    # Valid locations
    assert is_probable_location("Kuala Lumpur") is True
    assert is_probable_location("in KL") is True
    # Too long
    assert is_probable_location("I am currently living in the big city of Kuala Lumpur") is False
    # Contains disallowed words
    assert is_probable_location("I need a refund in KL") is False
    assert is_probable_location("order tracking") is False
