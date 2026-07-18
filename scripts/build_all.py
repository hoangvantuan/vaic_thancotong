"""Rebuild the clean data layer (docs/dataset/) entirely from docs/raw/.

Run this after changing any raw source or any build script. docs/raw/ is never modified;
everything under docs/dataset/ (catalog/, conversations/, knowledge/) is regenerated.

    python3 scripts/build_all.py
"""
import build_catalog
import clean_conversations
import build_knowledge


def main():
    print("== build_catalog ==")
    build_catalog.main()
    print("\n== clean_conversations ==")
    clean_conversations.main()
    print("\n== build_knowledge ==")
    build_knowledge.main()
    print("\nDone. Clean data layer -> docs/dataset/")


if __name__ == "__main__":
    main()
