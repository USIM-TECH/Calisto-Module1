import yaml

nlu_file = "data/nlu.yml"
domain_file = "domain.yml"

# read domain.yml
with open(domain_file, "r") as f:
    domain_data = f.read()

new_intents = [
    "return_request",
    "refund_request",
    "exchange_request",
    "warranty_support",
    "repair_support",
    "order_support"
]

for intent in new_intents:
    if f"- {intent}" not in domain_data:
        domain_data = domain_data.replace("  - warranty_claim", f"  - warranty_claim\n  - {intent}")
        domain_data = domain_data.replace("      - search_product_by_attribute", f"      - search_product_by_attribute\n      - {intent}")

with open(domain_file, "w") as f:
    f.write(domain_data)

nlu_append = """
  - intent: return_request
    examples: |
      - i need to return my glasses
      - return my eyewear
      - i want to return my sunglasses
      - can i return these glasses
      - i bought the wrong glasses
      - return my gucci glasses
      - return request
      - how do i return
      - i need a return
      - send back my glasses
      - i dont want these glasses
      - return my order
      - help me return this
      - i want to send this back
      - can i give this back
      - i want to return

  - intent: refund_request
    examples: |
      - i need refund
      - refund policy
      - can i get a refund
      - refund my purchase
      - i want my money back
      - request refund
      - refund for my glasses
      - how do refunds work
      - money back policy
      - full refund please
      - i want reimbursement
      - can i cancel and refund
      - refund these sunglasses
      - give me a refund

  - intent: exchange_request
    examples: |
      - exchange my glasses
      - can i exchange this frame
      - swap my sunglasses
      - wrong size frame
      - exchange request
      - i need replacement glasses
      - replace this eyewear
      - different frame please
      - can i change model
      - exchange these lenses
      - i want an exchange

  - intent: repair_support
    examples: |
      - my glasses broke
      - broken frame
      - scratched lens
      - repair my glasses
      - fix my sunglasses
      - damaged eyewear
      - my frame is damaged
      - loose frame
      - bent glasses
      - repair support
      - fix my lenses
      - glasses need repair
      - my glasses cracked
      - fixing glasses

  - intent: warranty_support
    examples: |
      - warranty claim
      - do you offer warranty
      - warranty support
      - claim warranty
      - covered under warranty
      - warranty for lenses
      - frame warranty
      - broken under warranty
      - warranty policy
      - lens warranty
      - is this under warranty

  - intent: order_support
    examples: |
      - order problem
      - issue with my order
      - order support
      - help with my purchase
      - cancel my order
      - tracking order
      - where is my order
      - order is delayed
"""

with open(nlu_file, "a") as f:
    f.write(nlu_append)
