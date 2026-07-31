import re

BUDGET_KEYWORDS = re.compile(r"\b(under|below|max|budget|around|less\s*than|bawah|kurang\s*dari|di\s*bawah)\b", re.IGNORECASE)
CHEAP_KEYWORDS = re.compile(r"\b(cheap|affordable|budget|murah|bajet|cheapest|lowest)\b", re.IGNORECASE)
PREMIUM_KEYWORDS = re.compile(r"\b(premium|expensive|luxury|mewah|high.end)\b", re.IGNORECASE)
BEST_KEYWORDS = re.compile(r"\b(best|top rated|top-rated|highest rated)\b", re.IGNORECASE)

# Added common contact validation regexes as per user request
EMAIL_REGEX = re.compile(r"^[A-Za-z0-9\.\+_-]+@[A-Za-z0-9\._-]+\.[a-zA-Z]*$")
PHONE_REGEX = re.compile(r"^\+?[0-9\-\s\(\)]{8,20}$")
PRICE_REGEX = re.compile(r"(?:rm)?\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
NAME_REGEX = re.compile(r"^[A-Za-z\s\.\-]{2,50}$")

# specific to budget parsing
BUDGET_LOW_REGEX = re.compile(r"\b(cheap|cheapest|lowest|murah|jimat)\b", re.IGNORECASE)
BUDGET_AFFORDABLE_REGEX = re.compile(r"\b(affordable|budget)\b", re.IGNORECASE)
BUDGET_PREMIUM_REGEX = re.compile(r"\b(premium|luxury|expensive|mewah|high.end)\b", re.IGNORECASE)
BUDGET_BETWEEN_REGEX = re.compile(r"(?:between|dari|antara)?\s*(\d+(?:\.\d+)?)\s*(?:and|to|-|hingga|sampai)\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
BUDGET_UNDER_REGEX = re.compile(r"(?:under|below|less\s*than|bawah|kurang\s*dari|di\s*bawah|<)\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
BUDGET_OVER_REGEX = re.compile(r"(?:over|above|more\s*than|atas|lebih\s*dari|>)\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
BUDGET_AROUND_REGEX = re.compile(r"(?:around|about|sekitar|kira\.kira)\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
