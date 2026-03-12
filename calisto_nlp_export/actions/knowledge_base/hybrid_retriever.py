"""
Calisto Eyewear – Hybrid Retriever (FAISS + BM25)
Combines dense vector search with sparse keyword matching for better recall.
"""

import logging
import math
import re
from collections import Counter
from typing import Dict, List, Optional, Set

from actions.knowledge_base.config import (
    ALPHA_EMBEDDING,
    BETA_BM25,
    INTENT_CONFIDENCE_THRESHOLD,
    INTENT_SOURCE_MAP,
    TOP_K_FINAL,
    TOP_K_RETRIEVAL,
)

logger = logging.getLogger(__name__)


# ── BM25 Implementation (lightweight, no extra dependency) ──
class BM25:
    """Okapi BM25 scorer over a corpus of text chunks."""

    def __init__(self, corpus: List[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus_size = len(corpus)

        # Tokenise each document
        self.doc_tokens: List[List[str]] = [self._tokenize(doc) for doc in corpus]
        self.doc_lens = [len(t) for t in self.doc_tokens]
        self.avgdl = sum(self.doc_lens) / max(self.corpus_size, 1)

        # Build document frequency table
        self.df: Dict[str, int] = {}
        for tokens in self.doc_tokens:
            seen: Set[str] = set()
            for t in tokens:
                if t not in seen:
                    self.df[t] = self.df.get(t, 0) + 1
                    seen.add(t)

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        """Simple whitespace + punctuation tokeniser."""
        return re.findall(r"\w+", text.lower())

    def _idf(self, term: str) -> float:
        """Inverse document frequency with smoothing."""
        df = self.df.get(term, 0)
        return math.log((self.corpus_size - df + 0.5) / (df + 0.5) + 1.0)

    def score(self, query: str, doc_idx: int) -> float:
        """BM25 score for a single document given a query."""
        query_tokens = self._tokenize(query)
        doc_tokens = self.doc_tokens[doc_idx]
        doc_len = self.doc_lens[doc_idx]

        tf_map: Dict[str, int] = Counter(doc_tokens)
        total = 0.0
        for qt in query_tokens:
            tf = tf_map.get(qt, 0)
            if tf == 0:
                continue
            idf = self._idf(qt)
            numerator = tf * (self.k1 + 1)
            denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avgdl)
            total += idf * (numerator / denominator)
        return total

    def score_batch(self, query: str, doc_indices: Optional[List[int]] = None) -> List[float]:
        """Score a batch of documents. If doc_indices is None, score all."""
        indices = doc_indices if doc_indices is not None else list(range(self.corpus_size))
        return [self.score(query, idx) for idx in indices]


# ── Intent-based Document Filtering ────────────────────────
def filter_by_intent(
    meta: List[dict],
    intent_name: Optional[str],
    intent_confidence: float,
) -> Optional[List[int]]:
    """
    Return indices of chunks whose source matches the intent.
    Returns None if no filtering should be applied (unknown intent,
    low confidence, or no mapping defined).
    """
    if not intent_name or intent_confidence < INTENT_CONFIDENCE_THRESHOLD:
        return None

    allowed_sources = INTENT_SOURCE_MAP.get(intent_name)
    if not allowed_sources:
        return None

    filtered = [
        i for i, entry in enumerate(meta)
        if entry.get("source") in allowed_sources
    ]

    if not filtered:
        # If filtering yields no results, fall back to full corpus
        logger.debug("Intent filter '%s' matched 0 chunks – falling back to full corpus", intent_name)
        return None

    logger.debug(
        "Intent filter '%s' (conf=%.2f): %d/%d chunks from %s",
        intent_name, intent_confidence, len(filtered), len(meta), allowed_sources,
    )
    return filtered


# ── Result Re-ranking ──────────────────────────────────────
def rerank_results(
    results: List[dict],
    query: str,
    entities: Dict[str, List[str]],
    top_k: int = TOP_K_FINAL,
) -> List[dict]:
    """
    Re-rank retrieved results based on:
    1. Combined score (already FAISS + BM25)
    2. Keyword overlap bonus
    3. Entity presence bonus
    """
    query_tokens = set(re.findall(r"\w+", query.lower()))

    for result in results:
        base_score = result.get("score", 0.0)
        doc_text_lower = result.get("text", "").lower()
        doc_tokens = set(re.findall(r"\w+", doc_text_lower))

        # Keyword overlap: Jaccard-like bonus
        if query_tokens:
            overlap = len(query_tokens & doc_tokens) / len(query_tokens)
        else:
            overlap = 0.0
        keyword_bonus = overlap * 0.15  # up to +0.15

        # Entity presence bonus
        entity_bonus = 0.0
        all_entities = [v for vals in entities.values() for v in vals]
        for ent in all_entities:
            if ent.lower() in doc_text_lower:
                entity_bonus += 0.05  # +0.05 per entity found
        entity_bonus = min(entity_bonus, 0.15)  # cap at +0.15

        result["final_score"] = base_score + keyword_bonus + entity_bonus
        result["_keyword_bonus"] = keyword_bonus
        result["_entity_bonus"] = entity_bonus

    # Sort by final score descending
    results.sort(key=lambda x: x["final_score"], reverse=True)

    logger.debug(
        "Re-ranked top results: %s",
        [(r.get("source", "?"), f"{r['final_score']:.3f}") for r in results[:top_k]],
    )
    return results[:top_k]


# ── Hybrid Search Orchestrator ─────────────────────────────
def hybrid_search(
    searcher,
    bm25: BM25,
    query: str,
    entities: Dict[str, List[str]],
    intent_name: Optional[str] = None,
    intent_confidence: float = 0.0,
) -> List[dict]:
    """
    Full hybrid retrieval pipeline:
    1. Intent-based document filtering
    2. FAISS dense retrieval
    3. BM25 sparse retrieval
    4. Score fusion
    5. Re-ranking

    Returns top-k results with final_score.
    """
    meta = searcher.meta

    # Step 1: Intent-based filtering
    filtered_indices = filter_by_intent(meta, intent_name, intent_confidence)

    # Step 2: FAISS search
    faiss_results = searcher.search(query, top_k=TOP_K_RETRIEVAL)

    # Build a map: chunk_index → faiss_score
    faiss_scores: Dict[int, float] = {}
    for r in faiss_results:
        # Find the index in meta
        for i, m in enumerate(meta):
            if m["source"] == r["source"] and m["text"] == r["text"]:
                if filtered_indices is None or i in filtered_indices:
                    faiss_scores[i] = r["score"]
                break

    # Step 3: BM25 search over the same candidate set
    candidate_indices = list(faiss_scores.keys()) if filtered_indices is None else filtered_indices
    if not candidate_indices:
        candidate_indices = list(range(len(meta)))

    bm25_raw_scores = bm25.score_batch(query, candidate_indices)
    # Normalise BM25 scores to 0-1 range
    max_bm25 = max(bm25_raw_scores) if bm25_raw_scores and max(bm25_raw_scores) > 0 else 1.0
    bm25_scores: Dict[int, float] = {
        idx: score / max_bm25
        for idx, score in zip(candidate_indices, bm25_raw_scores)
    }

    # Step 4: Score fusion
    all_candidate_indices = set(faiss_scores.keys()) | set(bm25_scores.keys())
    combined: List[dict] = []
    for idx in all_candidate_indices:
        f_score = faiss_scores.get(idx, 0.0)
        b_score = bm25_scores.get(idx, 0.0)
        final = ALPHA_EMBEDDING * f_score + BETA_BM25 * b_score

        combined.append({
            "source": meta[idx]["source"],
            "text": meta[idx]["text"],
            "score": final,
            "_faiss_score": f_score,
            "_bm25_score": b_score,
        })

    # Sort by combined score
    combined.sort(key=lambda x: x["score"], reverse=True)

    # Take top candidates for re-ranking
    top_candidates = combined[:TOP_K_RETRIEVAL]

    # Step 5: Re-rank
    final_results = rerank_results(top_candidates, query, entities, top_k=TOP_K_FINAL)

    logger.debug(
        "Hybrid search: %d FAISS + %d BM25 candidates → %d final results",
        len(faiss_scores), len(bm25_scores), len(final_results),
    )
    return final_results
