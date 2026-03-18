#!/usr/bin/env python3
"""
Calisto Eyewear – Build FAISS Knowledge Base Index

Usage (from the calisto_nlp_export directory):
    python scripts/build_index.py

This reads all documents in knowledge_base/ and creates:
    knowledge_base/index/calisto.faiss
    knowledge_base/index/calisto_meta.json
"""

import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from actions.knowledge_base.loader import load_all_documents
from actions.knowledge_base.chunker import prepare_chunks
from actions.knowledge_base.indexer import build_index


def main() -> None:
    kb_dir = os.path.join(PROJECT_ROOT, "knowledge_base")

    if not os.path.isdir(kb_dir):
        print(f"[!] knowledge_base directory not found: {kb_dir}")
        sys.exit(1)

    print("[1/3] Loading documents …")
    documents = load_all_documents(kb_dir)
    print(f"      Loaded {len(documents)} document segments")

    print("[2/3] Chunking text …")
    chunks = prepare_chunks(documents, chunk_size=100)
    print(f"      Created {len(chunks)} chunks")

    print("[3/3] Building FAISS index …")
    build_index(chunks)
    print("\nDone! You can now start the action server.")


if __name__ == "__main__":
    main()
