"""Demo: câu khách -> [agent làm rõ] -> Need đủ -> search -> top 3 kèm lý do.

Chạy: python3 demo.py

Demo tự đóng vai AGENT hỏi ngược (dùng clarify.missing_critical): nếu Need còn
thiếu slot quyết định thì DỪNG ở bước hỏi, KHÔNG gọi search. search chỉ chạy
khi Need đã đủ rõ - đúng ranh giới trách nhiệm của module.
"""
import sys, time
from dmx_search.catalog import load_catalog, dedupe, known_brands, build_category_hints
from dmx_search.clarify import missing_required, recommended_to_ask
from dmx_search.extract import extract
from dmx_search.search import search

ROOT = "../docs/dataset/catalog/"

# Câu hỏi ngược mẫu cho từng slot - trong hệ thật là việc của agent hội thoại.
_ASK = {
    "tiêu chí tìm kiếm": "Anh/chị đang cần mua sản phẩm gì, tầm giá hay hãng nào ạ?",
    "category": "Anh/chị đang cần mua loại sản phẩm gì ạ (máy lạnh, tủ lạnh, máy giặt...)?",
    "area_m2": "Phòng mình rộng khoảng bao nhiêu m² để em chọn công suất cho vừa ạ?",
    "people": "Nhà mình mấy người dùng để em chọn dung tích cho vừa ạ?",
    "budget_max": "Anh/chị dự tính tầm giá khoảng bao nhiêu ạ?",
}

def money(v): return f"{v:,.0f}đ".replace(",", ".")

def run(text, products, brands, hints):
    t0 = time.perf_counter()
    need = extract(text, hints, brands)

    print("=" * 96)
    print(f'KHÁCH: "{text}"')
    print(f"TRÍCH ĐƯỢC: category={need.category} budget<={need.budget_max and money(need.budget_max)} "
          f"area={need.area_m2} people={need.people} room={need.room} "
          f"concepts={need.concepts} energy={need.wants_energy_saving} brands={need.brands}")

    # --- Tầng AGENT: Need RỖNG (0 tín hiệu) -> CHẶN, hỏi khách cần tìm gì ---
    if required := missing_required(need):
        ms = (time.perf_counter() - t0) * 1000
        print(f"[AGENT] chưa có tín hiệu tìm kiếm {required} -> CHƯA gọi search, hỏi ngược | {ms:.0f}ms")
        for slot in required:
            print(f"     ❔ {_ASK.get(slot, slot)}")
        print()
        return

    # --- Có ít nhất 1 tín hiệu -> search chạy; slot khuyến nghị chỉ GỢI Ý hỏi thêm ---
    res = search(products, need, k=5)
    ms = (time.perf_counter() - t0) * 1000
    print(f"Khớp {res.total_matched} sản phẩm | loại {res.filtered_out_by_budget} vì vượt ngân sách | {ms:.0f}ms")
    if rec := recommended_to_ask(need):
        print(f"[AGENT] search vẫn chạy, nhưng nên hỏi thêm cho sát: {rec}")
        for slot in rec:
            print(f"     ❔ {_ASK.get(slot, slot)}")
    print()
    for i, s in enumerate(res.top, 1):
        p = s.product
        print(f"[{i}] {p.display_name}  —  {money(p.price().num) if p.has_price() else 'chưa có giá'}  (điểm {s.total:.2f})")
        print(s.breakdown())
        if s.caveats:
            print(f"     ⚠ nhược điểm: {'; '.join(s.caveats[:3])}")
        print()
    if res.unverified_fit:
        print(f"  + {len(res.unverified_fit)} mẫu trong ngân sách nhưng HÃNG CHƯA CÔNG BỐ phạm vi/số người "
              f"-> chưa dám khẳng định hợp, cần kiểm tra thêm:")
        for s in res.unverified_fit[:3]:
            print(f"      - {s.product.display_name}  —  {money(s.product.price().num)} (điểm {s.total:.2f})")
    if res.no_price:
        print(f"  + {len(res.no_price)} mẫu khác hợp nhu cầu nhưng CHƯA CÓ GIÁ trong data:")
        for s in res.no_price[:3]:
            print(f"      - {s.product.display_name} (điểm {s.total:.2f})")
    print()

if __name__ == "__main__":
    t0 = time.perf_counter()
    products = dedupe(load_catalog(ROOT))
    brands = known_brands(products)
    hints = build_category_hints(products)   # từ khoá category TỰ SINH từ data
    print(f"Nạp {len(products)} sản phẩm / {len(brands)} hãng / {len(hints)} ngành "
          f"trong {(time.perf_counter()-t0)*1000:.0f}ms\n")

    queries = sys.argv[1:] or [
        "Tôi cần mua máy pha cà phê",
    ]
    for q in queries:
        run(q, products, brands, hints)
