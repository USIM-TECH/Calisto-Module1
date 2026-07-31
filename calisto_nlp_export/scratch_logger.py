import re

with open("actions/actions.py", "r") as f:
    content = f.read()

# I am using a script because replacing complex python functions with multi_replace_file_content 
# requires exact matching of many lines of whitespace which is error-prone.

old_detect_support = """def detect_support_intent(tracker) -> str:
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

new_detect_support = """def detect_support_intent(tracker) -> tuple[str, str, bool]:
    # Returns (intent_name, override_reason, keyword_match)
    # 1. Check intent confidence
    intent = tracker.latest_message.get("intent", {})
    intent_name = intent.get("name", "")
    confidence = intent.get("confidence", 0.0)
    
    support_intents = set(SUPPORT_INTENT_MAP.keys()) | {"after_sales_support", "warranty_claim"}
    if confidence >= 0.7 and intent_name in support_intents:
        return (intent_name, "high_confidence_intent", False)

    # 2. Check keywords as firewall
    raw_text = tracker.latest_message.get("text") or ""
    if not raw_text or raw_text.startswith("/"):
        return ("", "", False)
    
    normalized = raw_text.lower()
    for sup_intent, keywords in SUPPORT_INTENT_MAP.items():
        if any(keyword in normalized for keyword in keywords):
            return (sup_intent, f"keyword_match_{sup_intent}", True)
            
    if any(keyword in normalized for keyword in SUPPORT_KEYWORDS):
        return ("after_sales_support", "keyword_match_generic_support", True)
        
    return ("", "", False)"""

content = content.replace(old_detect_support, new_detect_support)

old_smart_search_start = """    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        events = flow_entry_events(tracker, "product_search")
        lang = get_language(tracker)
        intent = get_latest_intent(tracker)
        intent_name = intent["name"]

        raw_text = tracker.latest_message.get("text") or ""
        support_intent = detect_support_intent(tracker)
        if support_intent:
            return route_support_flow(dispatcher, tracker, support_intent)"""

new_smart_search_start = """    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        events = flow_entry_events(tracker, "product_search")
        lang = get_language(tracker)
        intent = get_latest_intent(tracker)
        intent_name = intent["name"]

        raw_text = tracker.latest_message.get("text") or ""
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)
        
        if support_intent:
            logger.info({
                "intent": intent_name,
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
                "context_state": {s: tracker.get_slot(s) for s in MANAGED_SLOTS}
            })
            return route_support_flow(dispatcher, tracker, support_intent)"""

content = content.replace(old_smart_search_start, new_smart_search_start)


old_fallback = """    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        support_intent = detect_support_intent(tracker)
        if support_intent:
            return route_support_flow(dispatcher, tracker, support_intent)"""

new_fallback = """    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)
        if support_intent:
            logger.info({
                "intent": "action_default_fallback",
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
                "context_state": {s: tracker.get_slot(s) for s in MANAGED_SLOTS}
            })
            return route_support_flow(dispatcher, tracker, support_intent)"""

content = content.replace(old_fallback, new_fallback)

old_recommend = """    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        support_intent = detect_support_intent(tracker)
        if support_intent:
            return route_support_flow(dispatcher, tracker, support_intent)"""

new_recommend = """    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)
        if support_intent:
            logger.info({
                "intent": "product_recommendation",
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
                "context_state": {s: tracker.get_slot(s) for s in MANAGED_SLOTS}
            })
            return route_support_flow(dispatcher, tracker, support_intent)"""

content = content.replace(old_recommend, new_recommend)


with open("actions/actions.py", "w") as f:
    f.write(content)

