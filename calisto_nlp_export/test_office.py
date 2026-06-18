import asyncio
from dotenv import load_dotenv
load_dotenv()
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk import Tracker
from actions.search import ActionSmartSearch

tracker = Tracker("default", {}, {"text": "i need office glasses"}, [], False, None, {}, "action_listen")
tracker.slots = {"use_case": "office", "product_type": "frames", "current_flow": "product_search", "preferred_language": "en"}
dispatcher = CollectingDispatcher()

action = ActionSmartSearch()
events = action.run(dispatcher, tracker, {})
print("Events:", events)
print("Messages:", dispatcher.messages)
