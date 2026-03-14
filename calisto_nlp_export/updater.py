import re

with open('/Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export/data/nlu.yml', 'r') as f:
    text = f.read()

# Add more examples to browse_eyewear
extra_browse = """      - can you show me some glasses
      - id like to look at frames
      - what spectacles do you have
      - show me your optical selection
      - i need to buy glasses
      - i want to see the eyewear catalog"""
text = text.replace("- looking for eyewear", "- looking for eyewear\n" + extra_browse)

# Add more examples to select_product_type
extra_product = """      - i need [Designer Frames](product_type) today
      - prefer [Luxury Sunglasses](product_type)
      - please show me [Contact Lenses](product_type)
      - do you have [Multifocal Lenses](product_type)
      - i'm interested in [Monthly Lenses](product_type)"""
text = text.replace("- show me [Luxury Sunglasses](product_type)", "- show me [Luxury Sunglasses](product_type)\n" + extra_product)

# More brands
extra_brand = """      - do you stock [Dior](brand)?
      - I want to see [Tom Ford](brand) glasses
      - show me [Ray-Ban](brand)
      - do you have [Oakley](brand) sunglasses
      - looking for [Prada](brand) frames"""
text = text.replace("- I am looking for [Gucci](brand)", "- I am looking for [Gucci](brand)\n" + extra_brand)

with open('/Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export/data/nlu.yml', 'w') as f:
    f.write(text)
