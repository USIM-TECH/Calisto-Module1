from dotenv import load_dotenv
load_dotenv()
from search.catalogue import load_catalogue
import pandas as pd

df = load_catalogue()
cl = df[df["product_type"] == "Contact Lenses"]
print("Total Contact Lenses:", len(cl))

acuvue = cl[cl["brand"].str.lower() == "acuvue"]
print("Acuvue Lenses:", len(acuvue))

if len(acuvue) > 0:
    for col in df.columns:
        values = acuvue[col].dropna().unique()
        if len(values) > 0:
            print(f"{col}: {values}")
