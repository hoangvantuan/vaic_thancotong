"""Clean and unify the raw chat histories into one anonymized JSONL.

Inputs (docs/raw/, immutable):
  - 35sample_chat_history.json   : valid JSON, list[{id, messages:[{role, content}]}].
  - chat_history_buy_product.json: two conversation shapes, only the FIRST is malformed:
      * conv 1  : missing its `"messages": ["` opener (closing `]` survives) + trailing commas;
                  messages sit loose inside the object.
      * conv 2+ : valid JSON, messages under key `"chat_history"`, with conversation_uuid /
                  username and a `user_info` block nested inside each message.
      It carries metadata the sample file lacks: per-message create_date / knowledge_data and
      conversation-level user_info / project_uuid / is_stop / label / tool traces.

Output (docs/dataset/conversations/):
  - conversations.jsonl : one conversation per line, unified schema, PII masked.

Key facts established by the team's research (kiem-dinh-tin-hieu-hanh-vi-hoi-thoai.md):
  - The 11 buy_product conversations DUPLICATE the first 11 of 35sample. They add metadata,
    not new decision journeys. So we KEEP both but tag them with a shared `source_group_id`
    and mark the buy copies `is_duplicate` — grouping prevents train/test leakage without
    throwing away the extra metadata.
  - PII masking is best-effort, not a guarantee. Phones/emails/order-ids and the structured
    user_info block are masked; free-text names/addresses are heuristic and flagged for review.
    URL tracking params (e.g. srsltid) are stripped. Raw files are never modified.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "docs" / "raw"
SAMPLE_PATH = RAW / "35sample_chat_history.json"
BUY_PATH = RAW / "chat_history_buy_product.json"
OUT = ROOT / "docs" / "dataset" / "conversations"

DUP_OVERLAP = 0.5   # Jaccard over user-message signatures to call two conversations the same


# ---------- tolerant, key-aware parser for the malformed buy_product file ----------

def parse_buy_conversations(text: str):
    """Recover conversations where each object lost its `"messages": [` opener.

    Reads each conversation object left to right: a `"key": value` pair is a
    conversation-level field (project_uuid, user_info, is_stop, ...); a bare `{` is a
    loose message object appended to `messages`; a stray `]` (the surviving array close)
    is skipped. This keeps every metadata field intact.
    """
    text = re.sub(r",(\s*[}\]])", r"\1", text)  # remove trailing commas
    dec = json.JSONDecoder()
    n = len(text)

    def skip_ws(i):
        while i < n and text[i] in " \t\r\n,":
            i += 1
        return i

    i = text.find("[") + 1
    convs = []
    while True:
        i = skip_ws(i)
        if i >= n or text[i] == "]":
            break
        if text[i] != "{":
            i += 1
            continue
        i += 1  # past conversation-opening '{'
        conv = {"messages": []}
        while i < n:
            i = skip_ws(i)
            if i >= n or text[i] == "}":
                i += 1
                break
            if text[i] == "]":
                i += 1  # stray messages-array close
                continue
            if text[i] == '"':
                key, kend = dec.raw_decode(text, i)
                i = skip_ws(kend)
                if i < n and text[i] == ":":
                    i += 1
                i = skip_ws(i)
                val, vend = dec.raw_decode(text, i)
                conv[key] = val
                i = vend
                continue
            if text[i] == "{":
                msg, mend = dec.raw_decode(text, i)
                conv["messages"].append(msg)
                i = mend
                continue
            i += 1
        # conv 2+ store messages under "chat_history"; conv 1 collected loose "messages"
        chat = conv.pop("chat_history", None)
        if chat is not None:
            conv["messages"] = chat
        convs.append(conv)
    return convs


# ---------- PII masking ----------

PHONE_RE = re.compile(r"(?<!\d)(?:\+84|0)\d{8,10}(?!\d)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
CCCD_RE = re.compile(r"(?<!\d)\d{12}(?!\d)")
ORDER_RE = re.compile(r"(?<!\d)\d{8,12}(?!\d)")   # only applied to tool/system turns

RECIPIENT_RE = re.compile(
    r"(Người nhận hàng|Người nhận|Tên người nhận|Tên khách hàng|Họ và tên|Họ tên)"
    r"(\s*[:：]\s*)([^\n.,;]+)")
ADDR_LABEL_RE = re.compile(
    r"(Địa chỉ nhận hàng|Địa chỉ giao hàng|Địa chỉ giao|Địa chỉ)(\s*[:：]\s*)([^\n]+)")
USER_ADDR_RE = re.compile(
    r"((?:số nhà|tòa nhà|tòa|toà|chung cư|khu phố|khu \d|thôn|ấp|tổ \d|ngõ|ngách|đường)\b[^\n]*)",
    re.IGNORECASE,
)
NAME_START_RE = re.compile(r"^\s*([A-ZĐÀ-Ỹ][a-zđà-ỹ]+(?:\s+[A-ZĐÀ-Ỹ][a-zđà-ỹ]+){1,3})\s*(?=,)")

USER_INFO_SECRET = {"username", "customername", "phone", "address", "customergender", "gender"}
USER_INFO_GEOCODE = {"provinceid", "districtid", "wardid"}


def clean_url(u):
    """Drop query string (srsltid and other tracking/identifying params)."""
    return re.sub(r"\?.*$", "", u) if isinstance(u, str) else u


def mask_pii(text, role):
    if not text:
        return text, []
    flags = []
    new = text
    for rx, repl, tag in ((PHONE_RE, "[SĐT]", "phone"),
                          (EMAIL_RE, "[EMAIL]", "email"),
                          (CCCD_RE, "[CCCD]", "cccd")):
        if rx.search(new):
            new = rx.sub(repl, new)
            flags.append(tag)
    if RECIPIENT_RE.search(new):
        new = RECIPIENT_RE.sub(lambda m: m.group(1) + m.group(2) + "[TÊN]", new)
        flags.append("name")
    if ADDR_LABEL_RE.search(new):
        new = ADDR_LABEL_RE.sub(lambda m: m.group(1) + m.group(2) + "[ĐỊA_CHỈ]", new)
        flags.append("address")
    if role == "user":
        if USER_ADDR_RE.search(new):
            new = USER_ADDR_RE.sub("[ĐỊA_CHỈ]", new)
            flags.append("address_heuristic")
        if flags and NAME_START_RE.search(new):
            new = NAME_START_RE.sub("[TÊN]", new)
            flags.append("name_heuristic")
    if role in ("tool", "system") and ORDER_RE.search(new):
        new = ORDER_RE.sub("[MÃ_ĐƠN]", new)
        flags.append("order_id")
    return new, sorted(set(flags))


def mask_user_info(ui):
    """Mask the structured customer block; keep keys so the schema stays visible."""
    if not isinstance(ui, dict):
        return ui, False
    out, masked = {}, False
    for k, v in ui.items():
        if v in (None, "", 0):
            out[k] = v
            continue
        kl = k.lower()
        if kl in USER_INFO_SECRET:
            out[k], masked = "[ĐÃ_ẨN]", True
        elif kl in USER_INFO_GEOCODE:
            out[k], masked = "[MÃ_VÙNG]", True
        else:
            out[k] = v
    return out, masked


def clean_message(m):
    """Return (clean message data, pii flags). Flags are NOT stored on the message —
    they are process metadata that goes to the sidecar, not the dataset record."""
    role = m.get("role")
    out = dict(m)  # keep every data field (create_date, knowledge_data, product refs, ...)
    content, flags = mask_pii(m.get("content"), role)
    out["content"] = content
    if out.get("web_url"):
        out["web_url"] = clean_url(out["web_url"])
    if isinstance(out.get("user_info"), dict):   # conv 2+ nest user_info per message
        out["user_info"], ui = mask_user_info(out["user_info"])
        if ui:
            flags.append("user_info")
    out.pop("pii_flags", None)
    return out, sorted(set(flags))


# ---------- duplicate grouping ----------

def user_signature(raw_messages):
    """Set of normalized user utterances (digits & bracket placeholders removed) for
    matching near-duplicate conversations across the two files."""
    toks = set()
    for m in raw_messages:
        if m.get("role") == "user" and m.get("content"):
            t = re.sub(r"\[[^\]]*\]", "", m["content"])
            t = re.sub(r"\d", "", t)
            t = re.sub(r"\s+", " ", t).strip().lower()
            if len(t) >= 4:
                toks.add(t)
    return toks


def group_duplicates(units):
    """Union-find over conversations by user-signature Jaccard overlap."""
    parent = list(range(len(units)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    sigs = [user_signature(u["raw_messages"]) for u in units]
    for a in range(len(units)):
        for b in range(a + 1, len(units)):
            if not sigs[a] or not sigs[b]:
                continue
            inter = len(sigs[a] & sigs[b])
            union_sz = len(sigs[a] | sigs[b])
            if union_sz and inter / union_sz >= DUP_OVERLAP:
                union(a, b)
    return [find(x) for x in range(len(units))]


# ---------- assembly ----------

def build_record(unit):
    """Clean DATA-ONLY record (no process flags). Returns (record, needs_pii_review)."""
    cleaned, all_flags = [], []
    for m in unit["raw_messages"]:
        cm, flags = clean_message(m)
        cleaned.append(cm)
        all_flags.extend(flags)

    rec = {"id": unit["id"], "source": unit["source"]}
    extra = unit.get("extra") or {}
    if "user_info" in extra:
        extra = dict(extra)
        extra["user_info"], _ = mask_user_info(extra["user_info"])
    for k, v in extra.items():
        rec[k] = v
    rec["messages"] = cleaned

    review = any(f in ("address_heuristic", "name_heuristic") for f in all_flags)
    return rec, review


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    units = []

    for c in json.loads(SAMPLE_PATH.read_text(encoding="utf-8")):
        units.append({
            "id": f"sample-{c.get('id')}",
            "source": "35sample",
            "raw_messages": c.get("messages", []),
            "extra": {},
        })

    n_sample = len(units)
    for i, conv in enumerate(parse_buy_conversations(BUY_PATH.read_text(encoding="utf-8"))):
        extra = {k: v for k, v in conv.items() if k != "messages"}
        units.append({
            "id": f"buy-{i}",
            "source": "buy_product",
            "raw_messages": conv.get("messages", []),
            "extra": extra,
        })
    n_buy = len(units) - n_sample

    roots = group_duplicates(units)
    # canonical = prefer a 35sample member, else lowest index, within each group
    groups = {}
    for idx, r in enumerate(roots):
        groups.setdefault(r, []).append(idx)
    canonical = {}
    group_name = {}
    for gi, (root, members) in enumerate(sorted(groups.items()), start=1):
        members_sorted = sorted(members, key=lambda x: (units[x]["source"] != "35sample", x))
        canon = members_sorted[0]
        for m in members:
            canonical[m] = canon
            group_name[m] = f"grp-{gi:02d}"

    records, review_ids = [], []
    for unit in units:
        rec, review = build_record(unit)
        records.append(rec)
        if review:
            review_ids.append(unit["id"])

    out_path = OUT / "conversations.jsonl"
    with out_path.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # ---- sidecar: process metadata (dedup + PII review). NOT part of the dataset records. ----
    dedup_groups, id_to_group = {}, {}
    for idx, unit in enumerate(units):
        g = group_name[idx]
        id_to_group[unit["id"]] = g
        grp = dedup_groups.setdefault(g, {"canonical": units[canonical[idx]]["id"], "members": []})
        grp["members"].append(unit["id"])

    meta = {
        "description": ("Metadata của quá trình làm sạch — KHÔNG phải dữ liệu. "
                        "Dùng khi chia train/test (chống rò rỉ) và để soát PII. "
                        "Bản ghi trong conversations.jsonl là dữ liệu thuần."),
        "dedup": {
            "note": ("11 hội thoại buy_product trùng nội dung 11 hội thoại đầu 35sample; "
                     "chia tập theo group để tránh rò rỉ (nguồn: nghiên cứu tín hiệu hành vi)."),
            "independent_groups": len(dedup_groups),
            "groups": dedup_groups,
        },
        "id_to_group": id_to_group,
        "pii_review_needed": sorted(review_ids),
    }
    meta_path = OUT / "conversations.meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"conversations.jsonl       : {len(records)} records (dữ liệu thuần, "
          f"35sample={n_sample}, buy_product={n_buy})")
    print(f"conversations.meta.json   : {len(dedup_groups)} nhóm độc lập, "
          f"{len(review_ids)} cần soát PII (sidecar)")
    print(f"-> {out_path}\n-> {meta_path}")


if __name__ == "__main__":
    main()
