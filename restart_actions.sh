#!/bin/bash
source ../.venv/bin/activate
nohup rasa run actions > actions.log 2>&1 &
