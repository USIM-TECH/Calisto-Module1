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
    def name(self) -> Text:
        return "action_handle_return_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "return_request")



class ActionHandleRefundSupport(Action):
    def name(self) -> Text:
        return "action_handle_refund_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "refund_request")



class ActionHandleRepairSupport(Action):
    def name(self) -> Text:
        return "action_handle_repair_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "repair_support")



class ActionHandleExchangeSupport(Action):
    def name(self) -> Text:
        return "action_handle_exchange_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "exchange_request")



class ActionHandleWarrantySupport(Action):
    def name(self) -> Text:
        return "action_handle_warranty_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "warranty_support")



class ActionHandleOrderSupport(Action):
    def name(self) -> Text:
        return "action_handle_order_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "order_support")



