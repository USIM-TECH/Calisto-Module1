"""
Calisto Eyewear – Query Preprocessor
Full pipeline: normalize → spell correct → lemmatize → expand → boost entities.
"""

import logging
import re
from difflib import get_close_matches
from typing import Dict, List, Optional, Set, Tuple

from actions.knowledge_base.config import (
    DOMAIN_VOCABULARY,
    ENTITY_PATTERNS,
    PRICE_PHRASES,
    SYNONYM_MAP,
)

logger = logging.getLogger(__name__)

# ── Stopwords (lightweight, no NLTK download needed) ───────
_STOPWORDS: Set[str] = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "can", "could", "am", "it", "its", "this",
    "that", "these", "those", "i", "me", "my", "we", "our", "you", "your",
    "he", "she", "him", "her", "they", "them", "their", "of", "in", "to",
    "for", "on", "at", "by", "with", "from", "as", "into", "about",
    "up", "out", "so", "not", "no", "but", "if", "or", "and", "then",
    "just", "very", "too", "also", "there", "here", "when", "where",
    "what", "which", "who", "whom", "how",
}

# Build a flat set of all domain words for spell checking
_DOMAIN_WORDS: Set[str] = set()
for _term in DOMAIN_VOCABULARY:
    for _w in _term.lower().split():
        _DOMAIN_WORDS.add(_w)

# Also add every key and every value word from SYNONYM_MAP
for _key, _vals in SYNONYM_MAP.items():
    for _w in _key.lower().split():
        _DOMAIN_WORDS.add(_w)
    for _val in _vals:
        for _w in _val.lower().split():
            _DOMAIN_WORDS.add(_w)


# ── Step 1: Lowercase normalisation ───────────────────────
def _lowercase(text: str) -> str:
    return text.lower().strip()


# ── Step 2: Price/number query normalisation ──────────────
def _normalize_price_phrases(text: str) -> str:
    """Replace common price question phrases with the word 'price'."""
    # Sort by length descending so longer phrases match first
    for phrase in sorted(PRICE_PHRASES, key=len, reverse=True):
        if phrase in text:
            text = text.replace(phrase, PRICE_PHRASES[phrase], 1)
            logger.debug("Price normalisation: '%s' → replaced '%s'", text, phrase)
            break
    return text


# ── Step 3: Domain-specific spell correction ──────────────
def _correct_spelling(text: str) -> str:
    """Fix typos using domain vocabulary with fuzzy matching."""
    words = text.split()
    corrected = []
    for word in words:
        # Skip short words, numbers, RM amounts
        if len(word) <= 2 or word.isdigit() or re.match(r"rm\d+", word):
            corrected.append(word)
            continue
        # If the word is already known, keep it
        if word in _DOMAIN_WORDS or word in _STOPWORDS:
            corrected.append(word)
            continue
        # Try fuzzy match against domain vocabulary
        matches = get_close_matches(word, _DOMAIN_WORDS, n=1, cutoff=0.75)
        if matches and matches[0] != word:
            logger.debug("Spell correction: '%s' → '%s'", word, matches[0])
            corrected.append(matches[0])
        else:
            corrected.append(word)
    return " ".join(corrected)


# ── Step 4: Stopword removal ─────────────────────────────
def _remove_stopwords(text: str) -> str:
    """Remove common English stopwords, preserving meaningful domain words."""
    words = text.split()
    # Keep words that are either not stopwords OR are in domain vocabulary
    kept = [w for w in words if w not in _STOPWORDS or w in _DOMAIN_WORDS]
    # If everything got removed, return original
    return " ".join(kept) if kept else text


# ── Step 5: Lightweight lemmatisation ─────────────────────
# Avoids heavy spaCy dependency; handles common suffixes only
_LEMMA_RULES = [
    (r"ies$", "y"),    # categories → category
    (r"ses$", "s"),    # glasses → glass (careful: only specific)
    (r"ing$", ""),     # booking → book
    (r"tion$", "tion"),  # keep -tion words
    (r"ed$", ""),      # polarized → polariz → kept via domain
]

def _simple_lemmatize(text: str) -> str:
    """Apply minimal suffix-stripping lemmatisation."""
    words = text.split()
    result = []
    for word in words:
        if word in _DOMAIN_WORDS:
            # Domain terms stay as-is (don't lemmatize 'polarized' etc.)
            result.append(word)
            continue
        lemma = word
        # Only strip 'ing' or 'ed' if the stem is 4+ chars
        if word.endswith("ing") and len(word) > 6:
            stem = word[:-3]
            if stem in _DOMAIN_WORDS:
                lemma = stem
        elif word.endswith("ed") and len(word) > 5:
            stem = word[:-2]
            if stem in _DOMAIN_WORDS:
                lemma = stem
        result.append(lemma)
    return " ".join(result)


# ── Step 6: Synonym expansion ────────────────────────────
def _expand_synonyms(text: str, max_expansions: int = 3) -> str:
    """Add synonyms for recognised terms to broaden retrieval."""
    words_in_query = set(text.split())
    additions: List[str] = []

    # Check multi-word keys first (e.g., "blue light", "eye test")
    for key, synonyms in sorted(SYNONYM_MAP.items(), key=lambda x: -len(x[0])):
        if key in text:
            # Add up to max_expansions synonyms not already in the query
            for syn in synonyms[:max_expansions]:
                syn_words = set(syn.lower().split())
                if not syn_words.issubset(words_in_query):
                    additions.append(syn)
            break  # Only expand the first (longest) match found

    # Check single words
    if not additions:
        for word in list(words_in_query):
            if word in SYNONYM_MAP:
                for syn in SYNONYM_MAP[word][:max_expansions]:
                    syn_words = set(syn.lower().split())
                    if not syn_words.issubset(words_in_query):
                        additions.append(syn)
                break  # Only expand one term to avoid noise

    if additions:
        expanded = text + " " + " ".join(additions)
        logger.debug("Synonym expansion: '%s' → '%s'", text, expanded)
        return expanded

    return text


# ── Step 7: Entity extraction & query boosting ───────────
def extract_entities(text: str) -> Dict[str, List[str]]:
    """Extract entities using regex patterns from config."""
    found: Dict[str, List[str]] = {}
    for entity_type, patterns in ENTITY_PATTERNS.items():
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                found.setdefault(entity_type, []).extend(matches)
    return found


def _boost_entities(text: str, entities: Dict[str, List[str]]) -> str:
    """Repeat important entities to increase their weight in embedding."""
    boosts: List[str] = []
    for entity_type, values in entities.items():
        for val in values:
            if val.lower() not in text:
                continue
            # Location entities get expanded with "calisto store location"
            if entity_type == "location":
                boosts.append(f"{val} calisto store")
            # Product entities get boosted
            elif entity_type == "product":
                boosts.append(val)
            # Price entities add "price" context
            elif entity_type == "price":
                boosts.append("price")
    if boosts:
        boosted = text + " " + " ".join(boosts)
        logger.debug("Entity boost: '%s' → '%s'", text, boosted)
        return boosted
    return text


# ── FULL PIPELINE ────────────────────────────────────────
def preprocess_query(raw_query: str) -> Tuple[str, Dict[str, List[str]]]:
    """
    Full preprocessing pipeline:
      raw input → lowercase → price normalise → spell correct
      → stopword removal → lemmatise → synonym expand
      → entity extract → entity boost

    Returns (processed_query, extracted_entities).
    """
    logger.debug("Raw query: '%s'", raw_query)

    text = _lowercase(raw_query)
    text = _normalize_price_phrases(text)
    text = _correct_spelling(text)
    text = _remove_stopwords(text)
    text = _simple_lemmatize(text)
    text = _expand_synonyms(text)

    entities = extract_entities(text)
    text = _boost_entities(text, entities)

    logger.debug("Final preprocessed query: '%s'", text)
    return text, entities
