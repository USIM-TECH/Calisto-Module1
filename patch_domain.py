import yaml

with open('calisto_nlp_export/domain.yml', 'r') as f:
    domain = yaml.safe_load(f)

if 'search_product_by_attribute' not in domain.get('intents', []):
    domain['intents'].append('search_product_by_attribute')

for ent in ['frame_color', 'frame_shape', 'frame_material']:
    if ent not in domain.get('entities', []):
        domain['entities'].append(ent)
        domain['slots'][ent] = {'type': 'text', 'influence_conversation': True, 'mappings': [{'type': 'from_entity', 'entity': ent}]}

if 'actions' not in domain:
    domain['actions'] = []

if 'action_search_product_by_attribute' not in domain['actions']:
    domain['actions'].append('action_search_product_by_attribute')

with open('calisto_nlp_export/domain.yml', 'w') as f:
    yaml.dump(domain, f, sort_keys=False, default_flow_style=False)
