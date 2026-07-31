#!/bin/bash
source /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export/.venv/bin/activate
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
python modify.py

sed -i '' 's/- utter_ask_city/- action_ask_city/g' domain.yml
sed -i '' 's/- action: utter_ask_city/- action: action_ask_city/g' data/rules.yml
sed -i '' 's/- action: utter_ask_city/- action: action_ask_city/g' data/stories.yml
# In domain.yml we need to declare action_ask_city!
sed -i '' '/actions:/a\
  - action_ask_city
' domain.yml

rasa train
lsof -t -i :5055 | xargs kill -9
nohup rasa run actions > actions.log 2>&1 &
