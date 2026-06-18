"""
Tests for route_support_flow.

Correct behaviour (after clarification):
─────────────────────────────────────────
• return_request / refund_request / exchange_request / warranty_support / repair_support
  → show KB policy text (if found) → ALWAYS launch lead_capture_form
    (lead capture collects name / phone / email / city that haven't been filled yet)

• ask_faq  (handled by action_document_search, NOT route_support_flow)
  → show KB policy text → show "Start Return Request / Exchange / Back" buttons
  → NO lead capture form
  (this path is tested via ActionDocumentSearch, not this file)
"""
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tracker(text="I need to return my glasses", slots=None):
    tracker = MagicMock()
    tracker.latest_message = {
        "text": text,
        "intent": {"name": "return_request", "confidence": 0.95},
    }
    tracker.events = []
    tracker.active_loop = {}

    _slots = {
        "lead_name": None,
        "contact_number": None,
        "email": None,
        "lead_location": None,
        "preferred_service": None,
        "support_case_id": None,
        "current_flow": None,
        "requested_slot": None,
    }
    if slots:
        _slots.update(slots)
    tracker.get_slot = lambda k: _slots.get(k)
    return tracker


def _make_dispatcher():
    dispatcher = MagicMock()
    dispatcher.messages = []
    dispatcher.utter_message = MagicMock(
        side_effect=lambda **kw: dispatcher.messages.append(kw)
    )
    return dispatcher


FAKE_RETURN_POLICY = {
    "text": (
        "Q: What is your refund or return policy? "
        "A: Calisto offers a 14-day return and refund policy for all standard eyewear items "
        "provided they are in their original unworn condition with the original receipt."
    )
}

FAKE_WARRANTY_ENTRY = {
    "text": (
        "Q: Do you offer a warranty? "
        "A: All Calisto frames carry a 12-month warranty against manufacturing defects."
    )
}

UNRELATED_ENTRY = {"text": "Q: Where are your stores? A: We have outlets in KL."}


# ---------------------------------------------------------------------------
# Helper to invoke route_support_flow with mocked dependencies
# ---------------------------------------------------------------------------

def _run(intent_name, kb_entries, tracker=None, dispatcher=None):
    if tracker is None:
        tracker = _make_tracker()
    if dispatcher is None:
        dispatcher = _make_dispatcher()

    with patch("actions.utils.load_kb_metadata", return_value=kb_entries), \
         patch("actions.utils.latest_metadata", return_value={}), \
         patch("actions.utils.flow_entry_events", return_value=[]):
        from actions.utils import route_support_flow
        events = route_support_flow(dispatcher, tracker, intent_name)

    return events, dispatcher


# ---------------------------------------------------------------------------
# Tests: support action intents ALWAYS launch lead_capture_form
# ---------------------------------------------------------------------------

class TestRouteSupportFlowAlwaysLaunchesLeadCapture:
    """After showing KB policy, lead_capture_form is always launched for action intents."""

    def _assert_form_launched(self, events):
        followup = [
            e for e in events
            if isinstance(e, dict) and e.get("name") == "lead_capture_form"
        ]
        assert followup, (
            "Expected lead_capture_form to be launched — support team needs to follow up "
            "with the user's contact details."
        )

    # --- return_request ---

    def test_return_request_kb_found_launches_form(self):
        """Policy displayed AND form launched."""
        events, dispatcher = _run("return_request", [FAKE_RETURN_POLICY])
        self._assert_form_launched(events)

    def test_return_request_kb_found_shows_policy_text(self):
        """The 📄 policy message comes before the support intro."""
        _, dispatcher = _run("return_request", [FAKE_RETURN_POLICY])
        assert dispatcher.messages, "Expected at least one message"
        first = dispatcher.messages[0].get("text", "")
        assert "📄" in first
        assert "14-day" in first or "return" in first.lower()

    def test_return_request_no_kb_match_still_launches_form(self):
        """Even with no matching KB entry, the form is still launched."""
        events, _ = _run("return_request", [UNRELATED_ENTRY])
        self._assert_form_launched(events)

    # --- refund_request ---

    def test_refund_request_kb_found_launches_form(self):
        events, _ = _run("refund_request", [FAKE_RETURN_POLICY])
        self._assert_form_launched(events)

    # --- exchange_request (no KB policy lookup — always goes straight to form) ---

    def test_exchange_request_launches_form(self):
        events, _ = _run("exchange_request", [FAKE_RETURN_POLICY])
        self._assert_form_launched(events)

    # --- warranty_support ---

    def test_warranty_support_kb_found_launches_form(self):
        events, dispatcher = _run("warranty_support", [FAKE_WARRANTY_ENTRY])
        self._assert_form_launched(events)

    def test_warranty_support_kb_found_shows_policy_text(self):
        _, dispatcher = _run("warranty_support", [FAKE_WARRANTY_ENTRY])
        assert dispatcher.messages
        first = dispatcher.messages[0].get("text", "")
        assert "📄" in first
        assert "warranty" in first.lower()

    # --- repair_support ---

    def test_repair_support_launches_form(self):
        events, _ = _run("repair_support", [FAKE_WARRANTY_ENTRY])
        self._assert_form_launched(events)

    # --- order_support (no KB lookup) ---

    def test_order_support_launches_form(self):
        events, _ = _run("order_support", [])
        self._assert_form_launched(events)


class TestRouteSupportFlowSlotEvents:
    """Slot events emitted by route_support_flow are correct."""

    def _slot_map(self, events):
        return {
            e["name"]: e["value"]
            for e in events
            if isinstance(e, dict) and e.get("event") == "slot"
        }

    def test_preferred_service_set_for_return(self):
        events, _ = _run("return_request", [FAKE_RETURN_POLICY])
        slots = self._slot_map(events)
        assert slots.get("preferred_service") == "Return Request"

    def test_current_flow_set_to_support_flow(self):
        events, _ = _run("return_request", [FAKE_RETURN_POLICY])
        slots = self._slot_map(events)
        assert slots.get("current_flow") == "support_flow"

    def test_support_case_type_matches_intent(self):
        events, _ = _run("warranty_support", [FAKE_WARRANTY_ENTRY])
        slots = self._slot_map(events)
        assert slots.get("support_case_type") == "Warranty Support"

    def test_support_case_status_set_to_pending(self):
        events, _ = _run("return_request", [FAKE_RETURN_POLICY])
        slots = self._slot_map(events)
        assert slots.get("support_case_status") == "pending"
