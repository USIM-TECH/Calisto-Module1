import os

with open('actions/actions.py', 'r') as f:
    lines = f.readlines()

# Utilities are lines 51 to 1243 (0-indexed 51 to 1243)
# Actually, let's find the exact lines:
# Start at 'def resolve_interruption_flow'
# End at 'class ActionSetLanguage'

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if line.startswith('def resolve_interruption_flow('):
        start_idx = i
    if line.startswith('class ActionSetLanguage('):
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    utils_lines = lines[start_idx:end_idx]
    
    # Imports needed for utils
    utils_imports = lines[:start_idx]
    
    with open('actions/utils.py', 'w') as f:
        f.writelines(utils_imports)
        f.writelines(utils_lines)
    
    # actions.py now becomes imports + from actions.utils import * + classes
    actions_new = []
    actions_new.extend(lines[:start_idx])
    actions_new.append("from actions.utils import *\n")
    actions_new.extend(lines[end_idx:])
    
    with open('actions/actions.py', 'w') as f:
        f.writelines(actions_new)
    
    print("Split successful!")
else:
    print(f"Could not find indices: {start_idx}, {end_idx}")
