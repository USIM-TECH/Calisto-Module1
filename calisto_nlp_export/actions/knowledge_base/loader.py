"""
Calisto Eyewear – Document Loader
Loads PDF, DOCX, and CSV files from the knowledge_base folder.
"""

import os
import csv
import re
from typing import List, Tuple

import pypdf
import docx


def _clean_pdf_text(text: str) -> str:
    """Remove table-of-contents noise, lone numbers, and page headers."""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # Skip lines that are just page numbers or TOC entries like "10-14"
        if re.fullmatch(r"[\d\s\-–,]+", stripped):
            continue
        # Skip very short lines that are just numbers with a title
        if re.fullmatch(r"\d+", stripped):
            continue
        if stripped:
            cleaned.append(stripped)
    return "\n".join(cleaned)


def load_pdf(path: str) -> str:
    """Extract all text from a PDF file."""
    reader = pypdf.PdfReader(path)
    pages = [page.extract_text() or "" for page in reader.pages]
    return _clean_pdf_text("\n".join(pages))


def load_docx(path: str) -> str:
    """Extract all text from a DOCX file."""
    doc = docx.Document(path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def load_csv_as_text(path: str) -> List[str]:
    """Convert each CSV row into a readable text chunk.

    Returns one chunk per row so product-level search is precise.
    """
    chunks: List[str] = []
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            parts = [f"{k}: {v}" for k, v in row.items() if v]
            chunks.append(" | ".join(parts))
    return chunks


def load_all_documents(kb_dir: str) -> List[Tuple[str, str]]:
    """Load every supported file in *kb_dir*.

    Returns a list of (source_filename, text_content) tuples.
    CSV files return one tuple per row.
    """
    docs: List[Tuple[str, str]] = []

    for fname in sorted(os.listdir(kb_dir)):
        fpath = os.path.join(kb_dir, fname)
        ext = os.path.splitext(fname)[1].lower()

        if ext == ".pdf":
            text = load_pdf(fpath)
            docs.append((fname, text))
        elif ext == ".docx":
            text = load_docx(fpath)
            docs.append((fname, text))
        elif ext == ".csv":
            rows = load_csv_as_text(fpath)
            for row_text in rows:
                docs.append((fname, row_text))

    return docs
