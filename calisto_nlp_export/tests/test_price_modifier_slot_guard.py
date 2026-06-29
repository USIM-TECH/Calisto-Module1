import sys
import types
from unittest.mock import MagicMock, patch

import pandas as pd


if "rasa_sdk" not in sys.modules:
    rasa_sdk = types.ModuleType("rasa_sdk")

    class _Action:
        pass

    class _Tracker:
        pass

    class _FormValidationAction:
        pass

    class _Event(dict):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)

    class _SlotSet(_Event):
        def __init__(self, key, value):
            super().__init__(event="slot", name=key, value=value)

    class _FollowupAction(_Event):
        def __init__(self, name):
            super().__init__(event="followup", name=name)

    class _ActiveLoop(_Event):
        def __init__(self, name):
            super().__init__(event="active_loop", name=name)

    rasa_sdk.Action = _Action
    rasa_sdk.Tracker = _Tracker
    rasa_sdk.events = types.ModuleType("rasa_sdk.events")
    rasa_sdk.events.SlotSet = _SlotSet
    rasa_sdk.events.FollowupAction = _FollowupAction
    rasa_sdk.events.ActiveLoop = _ActiveLoop
    rasa_sdk.executor = types.ModuleType("rasa_sdk.executor")
    rasa_sdk.executor.CollectingDispatcher = object
    rasa_sdk.forms = types.ModuleType("rasa_sdk.forms")
    rasa_sdk.forms.FormValidationAction = _FormValidationAction
    sys.modules["rasa_sdk"] = rasa_sdk
    sys.modules["rasa_sdk.events"] = rasa_sdk.events
    sys.modules["rasa_sdk.executor"] = rasa_sdk.executor
    sys.modules["rasa_sdk.forms"] = rasa_sdk.forms


def _make_tracker():
    tracker = MagicMock()
    tracker.latest_message = {
        "text": "premium frames",
        "intent": {"name": "select_budget", "confidence": 0.95},
    }
    tracker.events = []
    tracker.active_loop = {}
    slots = {
        "price_modifier": "premium",
        "current_flow": "product_search",
    }
    tracker.get_slot = lambda key: slots.get(key)
    return tracker


def _make_dispatcher():
    dispatcher = MagicMock()
    dispatcher.utter_message = MagicMock()
    return dispatcher


def _catalogue():
    return pd.DataFrame(
        [
            {
                "product_type": "Designer Frames",
                "brand": "Acuvue",
                "category": "Frames",
                "product_name": "Acuvue Alpha",
                "price_myr": 199.0,
                "description": "A sample frame",
                "store_location": "KL",
                "city": "Kuala Lumpur",
            }
        ]
    )


def _slot_events(events):
    return [
        event
        for event in events
        if isinstance(event, dict) and event.get("event") == "slot"
    ]


def test_price_modifier_not_emitted_when_domain_does_not_support_it():
    from actions.search import search_products_engine

    tracker = _make_tracker()
    dispatcher = _make_dispatcher()

    patches = [
        patch("actions.search.load_catalogue", return_value=_catalogue()),
        patch("actions.search.build_dynamic_attribute_registry", return_value={}),
        patch("actions.search.extract_dynamic_attributes", return_value={}),
        patch("actions.search.extract_lens_requirements", return_value={}),
        patch("actions.search.parse_budget_from_text", return_value=None),
        patch("actions.search.rank_products_safely", side_effect=lambda df, **kwargs: df),
        patch("actions.search.emit_product_card", return_value=None),
        patch("actions.search.latest_metadata", return_value={}),
    ]

    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7]:
        events, success = search_products_engine(
            "premium frames",
            tracker,
            "en",
            "select_budget",
            dispatcher,
            domain={"slots": {"brand": {}}},
        )

    assert success is True
    assert all(event["name"] != "price_modifier" for event in _slot_events(events))


def test_price_modifier_emitted_when_domain_supports_it():
    from actions.search import search_products_engine

    tracker = _make_tracker()
    dispatcher = _make_dispatcher()

    patches = [
        patch("actions.search.load_catalogue", return_value=_catalogue()),
        patch("actions.search.build_dynamic_attribute_registry", return_value={}),
        patch("actions.search.extract_dynamic_attributes", return_value={}),
        patch("actions.search.extract_lens_requirements", return_value={}),
        patch("actions.search.parse_budget_from_text", return_value=None),
        patch("actions.search.rank_products_safely", side_effect=lambda df, **kwargs: df),
        patch("actions.search.emit_product_card", return_value=None),
        patch("actions.search.latest_metadata", return_value={}),
    ]

    with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7]:
        events, success = search_products_engine(
            "premium frames",
            tracker,
            "en",
            "select_budget",
            dispatcher,
            domain={"slots": {"brand": {}, "price_modifier": {}}},
        )

    assert success is True
    assert any(event["name"] == "price_modifier" and event["value"] == "premium" for event in _slot_events(events))
