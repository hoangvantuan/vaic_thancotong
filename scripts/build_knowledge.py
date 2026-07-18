"""Index the policy / knowledge Markdown files in docs/raw into one lookup file.

The .md files stay in docs/raw (human-readable already); we only produce an index so
the catalog/chat side has a single place to discover which policy answers what.

Output: docs/dataset/knowledge/policies.index.json
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "docs" / "raw"
OUT = ROOT / "docs" / "dataset" / "knowledge"


def summarize(md: str):
    """Title = first '# heading' if present, else first non-empty line.
    Summary = first prose line after the title."""
    title, summary = None, None
    for line in md.splitlines():
        s = line.strip()
        if not s:
            continue
        if title is None:
            title = s.lstrip("#").strip() if s.startswith("#") else re.sub(r"\s+", " ", s)
            title = title[:120]
            continue
        if summary is None and not s.startswith(("#", "```", "|", ">")):
            summary = re.sub(r"\s+", " ", s)[:200]
            break
    return title, summary


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for path in sorted(RAW.glob("*.md")):
        md = path.read_text(encoding="utf-8")
        title, summary = summarize(md)
        entries.append({
            "file": str(path.relative_to(ROOT)),
            "slug": path.stem,
            "title": title or path.stem,
            "summary": summary,
            "chars": len(md),
        })

    index = {"count": len(entries), "policies": entries}
    out_path = OUT / "policies.index.json"
    out_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"policies.index.json  : {len(entries)} policy documents indexed")
    for e in entries:
        print(f"  - {e['slug']}: {e['title']}")
    print(f"-> {out_path}")


if __name__ == "__main__":
    main()
