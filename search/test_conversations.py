"""Test module search trên HỘI THOẠI THẬT (docs/dataset/conversations).

Khác với test_search.py (câu tự soạn, khoá hành vi từng tiêu chí), file này lấy
CHÍNH câu khách trong 46 hội thoại CSKH thật rồi chạy đủ luồng:

    câu user  ──extract──►  Need  ──clarify──►  (đủ category?)  ──search──►  kết quả

Mục tiêu: ĐỐI CHIẾU dữ liệu search trả về với chính yêu cầu trong câu user.
Không cần nhãn vàng - ta kiểm các BẤT BIẾN phải luôn đúng, bất kể câu nào:

  1. search chỉ chạy khi Need đủ điều kiện bắt buộc (có category).
  2. Mọi SP trong `top` PHẢI đúng category mà câu user nói (search không lạc ngành).
  3. Mọi SP trong `top` PHẢI có giá thật (không bịa) và trong ngân sách (nếu khách nêu).
  4. Nếu câu lọc hãng, mọi SP top phải đúng hãng đó.
  5. Không câu nào làm search văng lỗi.

Chạy: python3 test_conversations.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from dmx_search.catalog import build_category_hints, dedupe, known_brands, load_catalog
from dmx_search.clarify import is_ready, signals
from dmx_search.extract import extract
from dmx_search.search import search

CATALOG_ROOT = "../docs/dataset/catalog"
CONVERSATIONS = "../docs/dataset/conversations/conversations.jsonl"

_fails: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if not cond:
        print(f"  FAIL {name}  {detail}")
        _fails.append(name)


def user_turns(path: str):
    """Trả (convo_id, chỉ_số_lượt, câu_user) cho mọi lượt user trong mọi hội thoại."""
    for rec in (json.loads(l) for l in Path(path).open(encoding="utf-8") if l.strip()):
        cid = rec.get("id", "?")
        turn = 0
        for m in rec.get("messages", []):
            if m.get("role") != "user":
                continue
            turn += 1
            content = (m.get("content") or "").strip()
            if content:
                yield cid, turn, content


def main() -> None:
    products = dedupe(load_catalog(CATALOG_ROOT))
    brands = known_brands(products)
    CATEGORY_HINTS = build_category_hints(products)

    turns = list(user_turns(CONVERSATIONS))
    print(f"Nạp {len(products)} sản phẩm | {len(turns)} lượt user thật từ hội thoại\n")

    n_searchable = 0            # lượt đủ category -> search chạy
    n_with_top = 0             # lượt search ra ít nhất 1 SP có giá
    n_budget = n_brand = 0     # lượt có ràng buộc ngân sách / hãng
    showcase: list[str] = []   # vài ca minh hoạ để in ra cuối

    for cid, turn, text in turns:
        need = extract(text, CATEGORY_HINTS, brands)

        # (1) clarify quyết search có được chạy không. 0 tín hiệu -> bỏ qua,
        # đó là việc của agent hỏi ngược, không phải của search.
        if not is_ready(need):
            continue
        n_searchable += 1

        # Không được văng lỗi trên bất kỳ câu thật nào.
        try:
            res = search(products, need, k=3)
        except Exception as e:  # noqa: BLE001 - test muốn thấy mọi lỗi
            check(f"[{cid}#{turn}] search không văng lỗi", False, f"{type(e).__name__}: {e}")
            continue

        # (2) đối chiếu CATEGORY: nếu khách NÊU ngành, mọi SP top đúng ngành đó.
        # (Khách chỉ nói ngân sách/hãng mà không nêu ngành -> không ràng ngành.)
        if need.category is not None:
            check(f"[{cid}#{turn}] top đúng category '{need.category}'",
                  all(s.product.slug == need.category for s in res.top),
                  f"lạc ngành: {[s.product.slug for s in res.top if s.product.slug != need.category]}")

        # (3a) đối chiếu GIÁ: mọi SP top có giá thật, không bịa.
        check(f"[{cid}#{turn}] mọi SP top có giá thật",
              all(s.product.has_price() for s in res.top),
              f"{[s.product.display_name for s in res.top if not s.product.has_price()]}")

        # (3b) đối chiếu NGÂN SÁCH: nếu khách nêu, top phải nằm trong.
        if need.budget_max is not None:
            n_budget += 1
            check(f"[{cid}#{turn}] top trong ngân sách <= {need.budget_max:,.0f}",
                  all(s.product.price().num <= need.budget_max for s in res.top),
                  f"{[(s.product.display_name, s.product.price().num) for s in res.top if s.product.price().num > need.budget_max]}")

        # (4) đối chiếu HÃNG: nếu lọc hãng, top chỉ đúng hãng đó.
        if need.brands:
            n_brand += 1
            check(f"[{cid}#{turn}] top đúng hãng {need.brands}",
                  all(s.product.brand in need.brands for s in res.top),
                  f"lạc hãng: {[s.product.brand for s in res.top if s.product.brand not in need.brands]}")

        # (5) đối chiếu LÝ DO: mọi SP top phải có lý do trỏ về nguồn (không tư vấn suông).
        check(f"[{cid}#{turn}] mọi SP top có lý do giải thích được",
              all(s.reasons for s in res.top))

        if res.top:
            n_with_top += 1
            if len(showcase) < 8:
                top = res.top[0].product
                cons = []
                if need.budget_max:
                    cons.append(f"<={need.budget_max/1e6:g}tr")
                if need.brands:
                    cons.append(f"hãng {need.brands[0]}")
                showcase.append(
                    f"  [{cid}#{turn}] {text[:52]!r}\n"
                    f"      -> {need.category} {' '.join(cons)} => {top.display_name} "
                    f"({top.price().num:,.0f}đ)")

    print(f"Lượt search được (≥1 tín hiệu): {n_searchable}/{len(turns)}")
    print(f"  · có kết quả top có giá: {n_with_top}")
    print(f"  · có ràng buộc ngân sách: {n_budget} | có ràng buộc hãng: {n_brand}\n")

    print("Ví dụ đối chiếu (câu thật -> Need -> SP search chọn):")
    print("\n".join(showcase))

    print(f"\n{'='*70}")
    if _fails:
        print(f"FAILED {len(_fails)} bất biến trên hội thoại thật:")
        for f in _fails[:20]:
            print(f"  - {f}")
        if len(_fails) > 20:
            print(f"  ... và {len(_fails)-20} lỗi nữa")
        sys.exit(1)
    print("TẤT CẢ BẤT BIẾN search PASS trên hội thoại thật")


if __name__ == "__main__":
    main()
