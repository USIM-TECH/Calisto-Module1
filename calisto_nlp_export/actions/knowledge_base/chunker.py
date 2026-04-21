"""
Calisto Eyewear – Text Chunker
Splits long documents into small, focused chunks for precise retrieval.
"""

import re
from typing import List, Tuple


def _split_paragraphs(text: str) -> List[str]:
    """Split text on blank lines or numbered headings."""
    blocks = re.split(r"\n\s*\n|(?=\n\d+\.\s)", text)
    return [b.strip() for b in blocks if b.strip()]


def _merge_small_blocks(
    blocks: List[str], min_words: int = 15, max_words: int = 100,
) -> List[str]:
    """Merge tiny blocks together; split huge blocks by word window."""
    merged: List[str] = []
    buf = ""
    for block in blocks:
        candidate = (buf + " " + block).strip() if buf else block
        if len(candidate.split()) <= max_words:
            buf = candidate
        else:
            if buf:
                merged.append(buf)
            # If single block > max_words, cut it
            words = block.split()
            while words:
                merged.append(" ".join(words[:max_words]))
                words = words[max_words:]
            buf = ""
    if buf and len(buf.split()) >= min_words:
        merged.append(buf)
    elif buf and merged:
        merged[-1] += " " + buf
    elif buf:
        merged.append(buf)
    return merged


def _window_words(text: str, chunk_size: int, overlap: int) -> List[str]:
    words = text.split()
    if not words:
        return []

    step = max(chunk_size - max(overlap, 0), 1)
    windows: List[str] = []
    for start in range(0, len(words), step):
        window = words[start:start + chunk_size]
        if not window:
            continue
        windows.append(" ".join(window))
        if start + chunk_size >= len(words):
            break
    return windows


def prepare_chunks(
    documents: List[Tuple[str, str]],
    chunk_size: int = 100,
    overlap: int = 20,
) -> List[Tuple[str, str]]:
    """Chunk all documents into small, focused passages."""
    all_chunks: List[Tuple[str, str]] = []

    for source, text in documents:
        word_count = len(text.split())
        if word_count <= chunk_size:
            all_chunks.append((source, text))
        else:
            paragraphs = _split_paragraphs(text)
            blocks = _merge_small_blocks(paragraphs, min_words=15, max_words=chunk_size)
            for block in blocks:
                for window in _window_words(block, chunk_size, overlap):
                    all_chunks.append((source, window))

    return all_chunks
