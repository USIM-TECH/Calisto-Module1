import re

def process_nlu():
    with open("/Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export/data/nlu.yml", "r") as f:
        content = f.read()

    # 1. Shrink search_product: remove weak examples
    # We will just replace the entire search_product examples block with a cleaner one.
    search_product_examples = """  - intent: search_product
    examples: |
      - gucci glasses under 700
      - black sunglasses below rm500
      - metal frames for office use
      - contact lenses under rm200
      - prada sunglasses
      - rayban aviator sunglasses
      - frame for driving under rm300
      - clear contact lenses daily
      - square black frames
      - tom ford sunglasses
      - titanium frames above 500
      - cat eye sunglasses below 400
      - rimless glasses rm200
      - round metal frames
      - oversized sunglasses
      - gucci frames
      - oakley sports sunglasses
      - ray-ban wayfarer
      - blue light blocking glasses metal
      - plastic frames black color"""
      
    content = re.sub(r'  - intent: search_product\n    examples: \|.*?(?=\n  - intent:)', search_product_examples, content, flags=re.DOTALL)

    # 2. Add more examples to support intents
    support_replacements = {
        "return_request": [
            "i need to return my glasses", "return my eyewear", "i want to return my sunglasses", 
            "can i return these glasses", "i bought the wrong glasses", "return my gucci glasses", 
            "return request", "how do i return", "i need a return", "send back my glasses", 
            "i dont want these glasses", "return my order", "help me return this", 
            "i want to send this back", "can i give this back", "i want to return",
            "process a return", "return policy", "how to return an item", "can i return my purchase",
            "returning my order", "want to return this", "need to send this item back", "where to return",
            "returning glasses", "return sunglasses", "i hate these glasses return them",
            "wrong glasses received", "wrong item want to return", "return for refund", "return for exchange",
            "is it possible to return", "how many days to return", "initiate a return", "start a return",
            "please accept my return", "need a return shipping label", "returning my frame", "send glasses back",
            "i made a mistake return this", "not what i expected return", "return my gucci frame"
        ],
        "refund_request": [
            "i need refund", "refund policy", "can i get a refund", "refund my purchase", 
            "i want my money back", "request refund", "refund for my glasses", "how do refunds work", 
            "money back policy", "full refund please", "i want reimbursement", "can i cancel and refund", 
            "refund these sunglasses", "give me a refund", "where is my refund", "refund status",
            "how to get a refund", "refund my money", "i want to cancel and get a refund", 
            "refund my order", "processing my refund", "when will i get my refund", "need a refund immediately",
            "refund to my credit card", "can you refund me", "i demand a refund", "not happy need refund",
            "refund the amount", "please refund my money", "i require a refund", "issue a refund",
            "money back guarantee", "reimburse my order", "reimburse my payment", "refund payment",
            "full refund required", "partial refund", "i am waiting for a refund", "cancel order and refund"
        ],
        "exchange_request": [
            "exchange my glasses", "can i exchange this frame", "swap my sunglasses", "wrong size frame", 
            "exchange request", "i need replacement glasses", "replace this eyewear", "different frame please", 
            "can i change model", "exchange these lenses", "i want an exchange", "exchange policy",
            "how to exchange", "swap for a different color", "exchange for a bigger size", "exchange item",
            "can i swap these", "replace with a different frame", "i want to replace these", "wrong size need exchange",
            "too small exchange", "too big exchange", "doesn't fit exchange", "exchange for another model",
            "how do i exchange", "process an exchange", "start an exchange", "exchanging my glasses",
            "can i get a replacement", "need to exchange for prescription", "exchange these contact lenses",
            "swap my purchase", "exchange for something else", "change my order item", "replace this frame"
        ],
        "repair_support": [
            "my glasses broke", "broken frame", "scratched lens", "repair my glasses", "fix my sunglasses", 
            "damaged eyewear", "my frame is damaged", "loose frame", "bent glasses", "repair support", 
            "fix my lenses", "glasses need repair", "my glasses cracked", "fixing glasses", "glasses are broken",
            "can you fix this", "frame is bent", "lens fell out", "screw missing", "arm broke off",
            "hinge is broken", "glasses damaged in mail", "scratched my sunglasses", "how to repair",
            "where can i repair my glasses", "do you do repairs", "broken sunglasses", "repairing a frame",
            "my lenses have a crack", "cracked frame", "defective glasses", "my glasses are defective",
            "broken nose pad", "replace nose pads", "frame adjustment", "need to adjust my glasses",
            "glasses are crooked", "fix my broken glasses", "can this be repaired", "repair shop"
        ],
        "warranty_support": [
            "warranty claim", "do you offer warranty", "warranty support", "claim warranty", 
            "covered under warranty", "warranty for lenses", "frame warranty", "broken under warranty", 
            "warranty policy", "lens warranty", "is this under warranty", "how long is the warranty",
            "warranty period", "does warranty cover scratches", "what is your warranty", "claim my warranty",
            "how to claim warranty", "warranty replacement", "under warranty", "is my frame under warranty",
            "warranty check", "warranty on sunglasses", "guarantee policy", "is there a guarantee",
            "warranty service", "warranty for my glasses", "does it have warranty", "submit a warranty claim",
            "warranty form", "warranty details", "activate warranty", "how to use warranty",
            "is damage covered under warranty", "lifetime warranty", "1 year warranty"
        ],
        "order_support": [
            "order problem", "issue with my order", "order support", "help with my purchase", "cancel my order", 
            "tracking order", "where is my order", "order is delayed", "wrong order", "missing item",
            "order not received", "cancel my purchase", "how to cancel order", "change my order",
            "update my order", "modify my order", "order status", "track my shipment", "shipping delay",
            "where are my glasses", "package lost", "order delivery", "when will my order arrive",
            "check order status", "order confirmation", "didn't get an email", "support for my order",
            "customer service for my order", "need help with delivery", "delivery issue", "shipping problem",
            "courier problem", "cancel it", "i want to cancel", "cancel this order please"
        ]
    }

    for intent, new_examples in support_replacements.items():
        pattern = r'  - intent: ' + intent + r'\n    examples: \|.*?(?=\n  - intent:|\Z)'
        replacement = f"  - intent: {intent}\n    examples: |\n" + "\n".join([f"      - {ex}" for ex in new_examples])
        content = re.sub(pattern, replacement, content, flags=re.DOTALL)

    with open("/Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export/data/nlu.yml", "w") as f:
        f.write(content)

process_nlu()
