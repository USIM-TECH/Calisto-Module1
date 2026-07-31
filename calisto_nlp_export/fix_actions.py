import re

with open("actions/actions.py", "r") as f:
    content = f.read()

# 1. Update SUPPORT_KEYWORDS and SUPPORT_INTENT_MAP
old_support_keywords = """SUPPORT_KEYWORDS = {
    "return",
    "refund",
    "exchange",
    "warranty",
    "repair",
    "broken",
    "damaged",
    "cancel",
    "support",
    "after sales",
    "after-sales",
    "order tracking",
    "track order",
    "tracking",
    "complaint",
    "defect",
}
SUPPORT_INTENT_MAP = {
    "warranty_claim": ["warranty", "repair", "broken", "damaged", "defect", "claim"],
    "order_tracking": ["order tracking", "track order", "tracking", "delivery", "shipment"],
    "after_sales_support": ["return", "refund", "exchange", "cancel", "after sales", "after-sales", "support", "complaint"],
}"""

new_support_keywords = """SUPPORT_KEYWORDS = {
    "return", "refund", "exchange", "repair", "warranty", "broken", 
    "damaged", "support", "scratched", "cracked", "cancel order", 
    "defective", "after sales", "after-sales", "order tracking", 
    "track order", "tracking", "complaint", "cancel", "wrong size", "different frame"
}

SUPPORT_INTENT_MAP = {
    "return_request": ["return", "send back"],
    "refund_request": ["refund", "reimbursement", "money back"],
    "exchange_request": ["exchange", "swap", "replace", "wrong size", "different frame"],
    "warranty_support": ["warranty", "claim warranty"],
    "repair_support": ["repair", "broken", "damaged", "scratched", "cracked", "defective", "fix", "loose frame", "bent"],
    "order_support": ["cancel order", "order tracking", "track order", "tracking", "delivery", "shipment", "order problem"],
    "after_sales_support": ["after sales", "after-sales", "support", "complaint", "help with my order"],
}"""

content = content.replace(old_support_keywords, new_support_keywords)

# 2. Add detect_support_intent
old_detect_support = """def detect_support_intent_from_text(text: str) -> str:
    if not text or text.startswith("/"):
        return ""
    normalized = normalize_search_text(text)
    for intent_name, keywords in SUPPORT_INTENT_MAP.items():
        if any(keyword in normalized for keyword in keywords):
            return intent_name
    if any(keyword in normalized for keyword in SUPPORT_KEYWORDS):
        return "after_sales_support"
    return \"\""""

new_detect_support = """def detect_support_intent(tracker) -> str:
    # 1. Check intent confidence
    intent = tracker.latest_message.get("intent", {})
    intent_name = intent.get("name", "")
    confidence = intent.get("confidence", 0.0)
    
    # Allow these support intents to override if confidence is high
    support_intents = set(SUPPORT_INTENT_MAP.keys()) | {"after_sales_support", "warranty_claim"}
    if confidence >= 0.7 and intent_name in support_intents:
        return intent_name

    # 2. Check keywords as firewall
    raw_text = tracker.latest_message.get("text") or ""
    if not raw_text or raw_text.startswith("/"):
        return ""
    
    normalized = normalize_search_text(raw_text)
    for sup_intent, keywords in SUPPORT_INTENT_MAP.items():
        if any(keyword in normalized for keyword in keywords):
            return sup_intent
            
    if any(keyword in normalized for keyword in SUPPORT_KEYWORDS):
        return "after_sales_support"
        
    return \"\""""

content = content.replace(old_detect_support, new_detect_support)

# 3. Update route_support_flow
old_route_support = """def route_support_flow(
    dispatcher: CollectingDispatcher,
    tracker: Tracker,
    intent_name: str,
) -> List[Dict[Text, Any]]:
    if intent_name == "warranty_claim":
        dispatcher.utter_message(response="utter_warranty_intro")
        preferred_service = "Warranty Support"
    elif intent_name == "order_tracking":
        dispatcher.utter_message(response="utter_order_tracking_intro")
        preferred_service = "Order Tracking"
    else:
        dispatcher.utter_message(response="utter_after_sales_intro")
        preferred_service = "After-sales Support"

    events = ActionPrefillLeadCapture().run(dispatcher, tracker, {})
    if not tracker.get_slot("preferred_service"):
        events.append(SlotSet("preferred_service", preferred_service))
    events.append(FollowupAction("lead_capture_form"))
    return events"""

new_route_support = """def route_support_flow(
    dispatcher: CollectingDispatcher,
    tracker: Tracker,
    intent_name: str,
) -> List[Dict[Text, Any]]:
    
    service_map = {
        "return_request": "Return Request",
        "refund_request": "Refund Request",
        "exchange_request": "Exchange Request",
        "warranty_support": "Warranty Support",
        "warranty_claim": "Warranty Support",
        "repair_support": "Repair Support",
        "order_support": "Order Tracking/Support",
        "order_tracking": "Order Tracking/Support"
    }
    preferred_service = service_map.get(intent_name, "After-sales Support")
    
    dispatcher.utter_message(text=f"I understand you need help with a {preferred_service.lower()}. Let me connect you with our support team.")

    events = ActionPrefillLeadCapture().run(dispatcher, tracker, {})
    
    # Always reset product search context entirely as per requirements
    clearable = set(MANAGED_SLOTS) - set(PERSISTENT_SLOTS)
    for slot_name in clearable:
        if tracker.get_slot(slot_name) is not None:
            events.append(SlotSet(slot_name, None))
            
    events.append(SlotSet("preferred_service", preferred_service))
    events.append(SlotSet("current_flow", "support_flow"))
    events.append(FollowupAction("lead_capture_form"))
    return events"""

content = content.replace(old_route_support, new_route_support)

# 4. Update ActionSmartSearch firewall call
content = content.replace("support_intent = detect_support_intent_from_text(raw_text)", "support_intent = detect_support_intent(tracker)")

# 5. Add firewall to ActionRecommendProducts
recommend_products_start = """    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        events = flow_entry_events(tracker, "product_recommendation")"""

recommend_products_firewall = """    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        support_intent = detect_support_intent(tracker)
        if support_intent:
            return route_support_flow(dispatcher, tracker, support_intent)
            
        events = flow_entry_events(tracker, "product_recommendation")"""

content = content.replace(recommend_products_start, recommend_products_firewall)

# 6. Fix budget dropping in relax loop
old_relax_loop = """            if step < len(relax_order):
                key = relax_order[step]
                if key == "budget" and active["budget"] and budget_can_relax:
                    relaxed_budget = True
                    relaxed_flags.append(key)
                elif active.get(key):
                    active[key] = False
                    relaxed_flags.append(key)"""

new_relax_loop = """            if step < len(relax_order):
                key = relax_order[step]
                if key == "budget":
                    if active["budget"] and not hard_budget:
                        active["budget"] = False
                        relaxed_flags.append(key)
                elif active.get(key):
                    active[key] = False
                    relaxed_flags.append(key)"""

content = content.replace(old_relax_loop, new_relax_loop)

# Ensure numeric price handling in filter_by_budget
content = content.replace('filtered = filtered[filtered["price_myr"] >= b_min]', 
                          'filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")\n        filtered = filtered[filtered["price_myr"] >= b_min]')
content = content.replace('filtered = filtered[filtered["price_myr"] <= b_max]', 
                          'filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")\n        filtered = filtered[filtered["price_myr"] <= b_max]')
content = content.replace('filtered = filtered[filtered["price_myr"] <= 150]', 
                          'filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")\n        filtered = filtered[filtered["price_myr"] <= 150]')
content = content.replace('filtered = filtered[filtered["price_myr"] >= 700]', 
                          'filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")\n        filtered = filtered[filtered["price_myr"] >= 700]')


with open("actions/actions.py", "w") as f:
    f.write(content)
