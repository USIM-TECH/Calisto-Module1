"""Calisto Eyewear – Document Loader backed by PostgreSQL."""

from typing import List, Tuple

from actions.knowledge_base.postgres_store import KnowledgeBaseStorage


def load_all_documents(_project_root: str) -> List[Tuple[str, str]]:
    """Load every searchable document segment from PostgreSQL.

    The argument is kept only for compatibility with existing callers.
    """
    return KnowledgeBaseStorage.get().document_rows()
