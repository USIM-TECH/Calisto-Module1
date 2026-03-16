#!/bin/bash
pkill -f 'rasa run actions'
nohup rasa run actions &
