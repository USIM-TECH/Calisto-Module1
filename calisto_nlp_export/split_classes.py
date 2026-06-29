import os

groups = {
    'core': ['ActionSetLanguage', 'ActionDefaultFallback', 'ActionHandleGreet'],
    'search': ['ActionSmartSearch', 'ActionDocumentSearch', 'ActionGreetOrSearch'],
    'lead': ['ActionPrefillLeadCapture', 'ActionHandleLeadCaptureInterruption', 'ActionSubmitLeadCapture', 'ActionQualifyLead'],
    'products': ['ActionFilterProducts', 'ActionExplainLens', 'ActionRecommendProducts', 'ActionSearchProductByAttribute', 'ActionFilterLenses', 'ActionAskBrand', 'ActionAskBudgetRange', 'ActionAskPurchaseTimeline', 'ActionResetEyewearSlots', 'ActionShowPricing'],
    'store': ['ActionAskCity', 'ActionFindStore', 'ActionHandleStoreHours', 'ActionBookAppointment'],
    'support': ['ActionHandleReturnSupport', 'ActionHandleRefundSupport', 'ActionHandleRepairSupport', 'ActionHandleExchangeSupport', 'ActionHandleWarrantySupport', 'ActionHandleOrderSupport']
}

with open('actions/actions.py', 'r') as f:
    lines = f.readlines()

# Extract the header (imports up to the first class)
header = []
idx = 0
while idx < len(lines):
    if lines[idx].startswith('class Action'):
        break
    header.append(lines[idx])
    idx += 1

classes = {}
current_class = None
class_lines = []

while idx < len(lines):
    line = lines[idx]
    if line.startswith('class Action'):
        if current_class:
            classes[current_class] = class_lines
        current_class = line.split('(')[0].split('class ')[1]
        class_lines = [line]
    else:
        if current_class:
            class_lines.append(line)
    idx += 1

if current_class:
    classes[current_class] = class_lines

# Write files
for group_name, class_list in groups.items():
    with open(f'actions/{group_name}.py', 'w') as f:
        # Standard imports needed for these actions
        f.write("import logging\n")
        f.write("from typing import Any, Dict, List, Text, Optional\n")
        f.write("import re\n")
        f.write("from rasa_sdk import Action, Tracker\n")
        f.write("from rasa_sdk.events import SlotSet, FollowupAction, ActiveLoop\n")
        f.write("from rasa_sdk.executor import CollectingDispatcher\n")
        f.write("from actions.utils import *\n")
        f.write("from nlp.city_resolver import resolve_city, is_probable_location\n")
        f.write("from forms.validators import *\n")
        f.write("from nlp.budget_parser import parse_budget\n")
        f.write("from config.settings import *\n")
        f.write("from config.constants import *\n")
        f.write("from config.regex_patterns import *\n")
        f.write("from search.filters import *\n")
        f.write("from search.formatters import *\n")
        f.write("from search.engine import rank_products_safely\n")
        f.write("\nlogger = logging.getLogger(__name__)\n\n")
        
        for cls_name in class_list:
            if cls_name in classes:
                f.writelines(classes[cls_name])
                f.write("\n")
            else:
                print(f"Warning: class {cls_name} not found")

# Rewrite actions.py to act as an export hub
with open('actions/actions.py', 'w') as f:
    f.write('"""\nCentral routing and exports for actions module.\n"""\n')
    f.write('from forms.lead_form import ValidateLeadCaptureForm\n')
    for group_name in groups.keys():
        f.write(f"from actions.{group_name} import *\n")
    print("actions.py has been rewritten to import all actions")
