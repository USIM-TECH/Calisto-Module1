import pytest
from nlp.budget_parser import parse_budget_from_text

def test_parse_budget_from_text_empty():
    assert parse_budget_from_text("") is None
    assert parse_budget_from_text(None) is None

def test_parse_budget_from_text_low_bucket():
    assert parse_budget_from_text("I want something cheap") == {"budget_bucket": "low"}
    assert parse_budget_from_text("murah") == {"budget_bucket": "low"}
    assert parse_budget_from_text("the lowest price") == {"budget_bucket": "low"}
    assert parse_budget_from_text("jimat") == {"budget_bucket": "low"}

def test_parse_budget_from_text_affordable():
    assert parse_budget_from_text("affordable") == {"budget_max": 300.0}
    assert parse_budget_from_text("on a budget") == {"budget_max": 300.0}

def test_parse_budget_from_text_premium():
    assert parse_budget_from_text("premium frames") == {"budget_min": 700.0, "budget_bucket": "premium"}
    assert parse_budget_from_text("luxury sunglasses") == {"budget_min": 700.0, "budget_bucket": "premium"}
    assert parse_budget_from_text("expensive") == {"budget_min": 700.0, "budget_bucket": "premium"}
    assert parse_budget_from_text("high-end") == {"budget_min": 700.0, "budget_bucket": "premium"}

def test_parse_budget_from_text_between():
    assert parse_budget_from_text("between rm100 and rm200") == {"budget_min": 100.0, "budget_max": 200.0}
    assert parse_budget_from_text("dari 150.5 hingga 250") == {"budget_min": 150.5, "budget_max": 250.0}
    assert parse_budget_from_text("100-200") == {"budget_min": 100.0, "budget_max": 200.0}
    assert parse_budget_from_text("antara 50 sampai 100") == {"budget_min": 50.0, "budget_max": 100.0}

def test_parse_budget_from_text_under():
    assert parse_budget_from_text("under rm200") == {"budget_max": 200.0}
    assert parse_budget_from_text("below 150") == {"budget_max": 150.0}
    assert parse_budget_from_text("less than 300.5") == {"budget_max": 300.5}
    assert parse_budget_from_text("bawah 200") == {"budget_max": 200.0}
    assert parse_budget_from_text("< 100") == {"budget_max": 100.0}

def test_parse_budget_from_text_over():
    assert parse_budget_from_text("over rm200") == {"budget_min": 200.0}
    assert parse_budget_from_text("above 150") == {"budget_min": 150.0}
    assert parse_budget_from_text("more than 300.5") == {"budget_min": 300.5}
    assert parse_budget_from_text("atas 200") == {"budget_min": 200.0}
    assert parse_budget_from_text("> 100") == {"budget_min": 100.0}

def test_parse_budget_from_text_around():
    # around 100 -> center=100. delta=max(20, 50) = 50. min=50, max=150
    assert parse_budget_from_text("around rm100") == {"budget_min": 50.0, "budget_max": 150.0}
    # around 300 -> center=300. delta=max(60, 50) = 60. min=240, max=360
    assert parse_budget_from_text("sekitar 300") == {"budget_min": 240.0, "budget_max": 360.0}
    # around 10 -> center=10. delta=max(2, 50) = 50. min=max(-40, 0)=0, max=60
    assert parse_budget_from_text("about 10") == {"budget_min": 0.0, "budget_max": 60.0}
