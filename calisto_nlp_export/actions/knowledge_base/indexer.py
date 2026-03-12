"""
Calisto Eyewear – FAISS Index Builder & Searcher
Builds a FAISS vector index from document chunks and provides search.
"""

import json
import os
from typing import List, Tuple

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

# ── Defaults ────────────────────────────────────────────────
MODEL_NAME = "all-MiniLM-L6-v2"
INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge_base", "index")
INDEX_PATH = os.path.join(INDEX_DIR, "calisto.faiss")
META_PATH = os.path.join(INDEX_DIR, "calisto_meta.json")


def build_index(chunks: List[Tuple[str, str]]) -> None:
    """Embed *chunks* and persist FAISS index + metadata to disk."""
    model = SentenceTransformer(MODEL_NAME)

    texts = [text for _, text in chunks]
    sources = [src for src, _ in chunks]

    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)
    embeddings = np.array(embeddings, dtype="float32")

    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)  # Inner-product (cosine) on normalised vectors
    index.add(embeddings)

    os.makedirs(INDEX_DIR, exist_ok=True)
    faiss.write_index(index, INDEX_PATH)

    meta = [{"source": s, "text": t} for s, t in zip(sources, texts)]
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"[✓] Index built: {index.ntotal} vectors  →  {INDEX_PATH}")


class KnowledgeSearcher:
    """Lazy-loaded searcher that lives across Rasa action-server requests."""

    _instance = None  # singleton

    def __init__(self) -> None:
        idx_path = os.path.normpath(INDEX_PATH)
        meta_path = os.path.normpath(META_PATH)

        self.index = faiss.read_index(idx_path)
        with open(meta_path, encoding="utf-8") as f:
            self.meta = json.load(f)
        self.model = SentenceTransformer(MODEL_NAME)

    @classmethod
    def get(cls) -> "KnowledgeSearcher":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def search(self, query: str, top_k: int = 3) -> List[dict]:
        """Return top-k results as dicts with keys: source, text, score."""
        vec = self.model.encode([query], normalize_embeddings=True)
        vec = np.array(vec, dtype="float32")

        scores, indices = self.index.search(vec, top_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            entry = self.meta[idx].copy()
            entry["score"] = float(score)
            results.append(entry)
        return results
