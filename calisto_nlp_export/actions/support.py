import logging
from typing import Any, Dict, List, Text, Optional
import re
from rasa_sdk import Action, Tracker
from rasa_sdk.events import SlotSet, FollowupAction, ActiveLoop
from rasa_sdk.executor import CollectingDispatcher
from actions.utils import *
from nlp.city_resolver import resolve_city, is_probable_location
from forms.validators import *
from nlp.budget_parser import parse_budget_from_text
from config.settings import *
from config.constants import *
from config.regex_patterns import *
from search.filters import *
from search.formatters import *
from search.engine import rank_products_safely

logger = logging.getLogger(__name__)

class ActionHandleReturnSupport(Action):
    """Handles return requests.

    Shows the return policy card first (informational layer), then escalates
    to the lead-capture form so the support team can follow up (operational layer).
    """

    def name(self) -> Text:
        return "action_handle_return_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        # Show return policy before escalating — KB lookup is NOT performed here;
        # utter_return_policy_menu contains the policy text in the card title.
        dispatcher.utter_message(response="utter_return_policy_menu")
        return route_support_flow(dispatcher, tracker, "return_request")


class ActionHandleRefundSupport(Action):
    """Handles refund requests.

    Shows the return/refund policy card first, then escalates to lead capture.
    """

    def name(self) -> Text:
        return "action_handle_refund_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        dispatcher.utter_message(response="utter_return_policy_menu")
        return route_support_flow(dispatcher, tracker, "refund_request")


class ActionHandleRepairSupport(Action):
    """Handles repair / damage reports.

    No specific policy card exists for repairs — escalates directly to
    lead capture so a support specialist can assess the case.
    """

    def name(self) -> Text:
        return "action_handle_repair_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "repair_support")


class ActionHandleExchangeSupport(Action):
    """Handles exchange requests.

    Shows the return/refund policy card (which covers exchange terms) before
    escalating to lead capture.
    """

    def name(self) -> Text:
        return "action_handle_exchange_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        dispatcher.utter_message(response="utter_return_policy_menu")
        return route_support_flow(dispatcher, tracker, "exchange_request")


class ActionHandleWarrantySupport(Action):
    """Handles warranty claims.

    Shows the warranty policy card first, then escalates to lead capture so
    an in-store specialist can assess the claim.
    """

    def name(self) -> Text:
        return "action_handle_warranty_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        dispatcher.utter_message(response="utter_warranty_policy_menu")
        return route_support_flow(dispatcher, tracker, "warranty_support")


class ActionHandleOrderSupport(Action):
    """Handles order tracking and order-related support.

    Escalates directly to lead capture — no policy card is needed as order
    status is looked up by the support team against the order ID.
    """

    def name(self) -> Text:
        return "action_handle_order_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "order_support")
