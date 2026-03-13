#!/usr/bin/env python3
"""
Calisto Eyewear – Build pgvector Knowledge Base Index

Usage (from the calisto_nlp_export directory):
    python scripts/build_index.py

This reads all knowledge-base documents from PostgreSQL, chunks them,
and stores their embeddings in PostgreSQL using pgvector.
"""

import os
import sys

# Ensure the project root is on sys.path so `actions.*` imports work.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)


def main() -> None:
    # Set environment before importing torch/sentence-transformers
    os.environ["TOKENIZERS_PARALLELISM"] = "false"

    import torch
    torch.set_num_threads(1)

    from actions.knowledge_base.loader import load_all_documents
    from actions.knowledge_base.chunker import prepare_chunks
    from actions.knowledge_base.indexer import build_index

    print("[1/3] Loading documents …")
    documents = load_all_documents(PROJECT_ROOT)
    print(f"      Loaded {len(documents)} document segments")

    print("[2/3] Chunking text …")
    chunks = prepare_chunks(documents, chunk_size=100)
    print(f"      Created {len(chunks)} chunks")

    print("[3/3] Building pgvector index …")
    build_index(chunks)
    print("\nDone! You can now start the action server.")


if __name__ == "__main__":
    main()
