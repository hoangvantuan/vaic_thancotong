"""Test trên DATA THẬT. Chạy: python3 test_search.py

Khoá lại các hành vi mà đề bài chấm điểm: không bịa, hỏi ngược khi thiếu,
top 3 đa dạng, parse đúng tiếng Việt văn nói.
"""

import sys

from dmx_search.catalog import build_category_hints, dedupe, known_brands, load_catalog
from dmx_search.clarify import is_ready, missing_required, recommended_to_ask, signals
from dmx_search.concepts import tag_to_concepts
from dmx_search.extract import extract
from dmx_search.normalize import (
    State,
    parse_area_range,
    parse_energy_label,
    parse_noise,
    parse_price,
    parse_volume_liters,
)
from dmx_search.search import search

ROOT = "../docs/dataset/catalog"
_fails: list[str] = []


def check(name, cond, detail=""):
    if cond:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name}  {detail}")
        _fails.append(name)


print("== normalize: giá trị THẬT lấy từ catalog ==")
check("area 'Từ 15 - 20m² (từ 40 đến 60m³)' -> 15..20",
      (v := parse_area_range("Từ 15 - 20m² (từ 40 đến 60m³)")).ok and (v.lo, v.hi) == (15, 20),
      f"got {v.lo},{v.hi}")
check("area 'Dưới 15m² (từ 30 đến 45m³)' -> 0..15",
      (v := parse_area_range("Dưới 15m² (từ 30 đến 45m³)")).ok and (v.lo, v.hi) == (0, 15),
      f"got {v.lo},{v.hi}")
check("area không nuốt nhầm số m³",
      parse_area_range("Từ 15 - 20m² (từ 40 đến 60m³)").hi == 20)
check("area 'Không' -> NOT_APPLICABLE",
      parse_area_range("Không").state is State.NOT_APPLICABLE)

check("noise 'Dàn lạnh: 45/34/29 dB - Dàn nóng: 51 dB' -> 29 (min dàn lạnh, bỏ dàn nóng)",
      (v := parse_noise("Dàn lạnh: 45/34/29 dB - Dàn nóng: 51 dB")).ok and v.num == 29,
      f"got {v.num}")
check("noise 'Dàn lạnh: 21 - 39 dB - Dàn nóng: 50 dB' -> 21",
      (v := parse_noise("Dàn lạnh: 21 - 39 dB - Dàn nóng: 50 dB")).ok and v.num == 21,
      f"got {v.num}")
check("noise '33/50 dB' -> 33", (v := parse_noise("33/50 dB")).ok and v.num == 33, f"got {v.num}")

check("energy '5 sao (Hiệu suất năng lượng 6.23)' -> 5 sao, COP 6.23",
      (v := parse_energy_label("5 sao (Hiệu suất năng lượng 6.23)")).ok and v.num == 5 and v.hi == 6.23,
      f"got {v.num},{v.hi}")
check("energy 'Đang cập nhật' -> UNDISCLOSED",
      parse_energy_label("Đang cập nhật").state is State.UNDISCLOSED)
check("energy 'Không có' -> NOT_APPLICABLE",
      parse_energy_label("Không có").state is State.NOT_APPLICABLE)

check("volume '180 lít' -> 180", (v := parse_volume_liters("180 lít")).ok and v.num == 180)
check("volume 'Hãng không công bố' -> UNDISCLOSED",
      parse_volume_liters("Hãng không công bố").state is State.UNDISCLOSED)
check("price None -> MISSING", parse_price(None).state is State.MISSING)
check("price 17630000 -> ok", parse_price(17630000).ok)
check("price rác '5' -> UNPARSED (ngoài dải giá hợp lệ)",
      parse_price("5").state is State.UNPARSED)

print("\n== concepts: gom biến thể marketing của các hãng ==")
for tag in ["Sleep Mode", "Chế độ ngủ đêm Best Sleep", "Chế độ ngủ ngon Good Sleep",
            "Chế độ chăm sóc giấc ngủ Sleep Curve", "Chế độ ngủ Dream Mode"]:
    check(f"'{tag}' -> sleep", "sleep" in tag_to_concepts(tag), tag_to_concepts(tag))
check("'Hoạt động siêu êm Quiet' -> quiet", "quiet" in tag_to_concepts("Hoạt động siêu êm Quiet"))
check("'Khóa trẻ em' KHÔNG phải kids_elderly (là khoá an toàn)",
      "kids_elderly" not in tag_to_concepts("Khóa trẻ em"), tag_to_concepts("Khóa trẻ em"))

print("\n== extract: tiếng Việt văn nói ==")
products = dedupe(load_catalog(ROOT))
brands = known_brands(products)
CATEGORY_HINTS = build_category_hints(products)
E = lambda t: extract(t, CATEGORY_HINTS, brands)

check("'dưới 20 triệu' -> 20tr", E("máy lạnh dưới 20 triệu").budget_max == 20_000_000)
check("'duoi 20tr' (không dấu) -> 20tr", E("may lanh duoi 20tr").budget_max == 20_000_000)
check("'tam 15 cu' -> 15tr", E("tu lanh tam 15 cu").budget_max == 15_000_000)
check("'9tr5' -> 9.5tr", E("may lanh 9tr5").budget_max == 9_500_000, E("may lanh 9tr5").budget_max)
check("'18m²' -> 18", E("phòng 18m² máy lạnh").area_m2 == 18)
check("'18m2' -> 18", E("may lanh 18m2").area_m2 == 18)
check("'gia dinh 4 nguoi' -> 4", E("tu lanh gia dinh 4 nguoi").people == 4)
check("'phòng ngủ' -> bedroom", E("máy lạnh phòng ngủ 18m2").room == "bedroom")
check("'gia dinh 4 nguoi' KHÔNG bị gán bedroom ('ngu' trong 'nguoi')",
      E("tu lanh cho gia dinh 4 nguoi tam 15 cu").room is None,
      E("tu lanh cho gia dinh 4 nguoi tam 15 cu").room)
check("'it on' -> quiet", "quiet" in E("may lanh it on").concepts)
check("'tiết kiệm điện' -> energy", E("máy lạnh tiết kiệm điện").wants_energy_saving)
check("'hang LG' -> brand LG", "LG" in E("may lanh hang LG").brands)
check("'điều hòa' -> may-lanh", E("mua điều hòa").category == "may-lanh")
check("fuzzy: 'máy pha cà phê' -> may-xay-ca-phe (ngành gần nhất trong data)",
      E("Tôi cần mua máy pha cà phê").category == "may-xay-ca-phe",
      E("Tôi cần mua máy pha cà phê").category)
check("fuzzy: 'may lam lanh' -> may-lanh",
      E("toi can may lam lanh").category == "may-lanh",
      E("toi can may lam lanh").category)
check("fuzzy KHÔNG lẫn ngành: 'may loc khong khi' -> thiet-bi-khong-khi (không phải lọc nước)",
      E("may loc khong khi").category == "thiet-bi-khong-khi",
      E("may loc khong khi").category)
check("fuzzy không đoán bừa: 'xin chao shop' -> None",
      E("xin chao shop").category is None,
      E("xin chao shop").category)
check("≥1 tín hiệu là search: 'mua may lanh' (category) đủ",
      is_ready(E("mua may lanh")) and missing_required(E("mua may lanh")) == [],
      signals(E("mua may lanh")))
check("chỉ ngân sách, KHÔNG category -> vẫn search được",
      is_ready(E("mua do duoi 15 trieu")) and "budget" in signals(E("mua do duoi 15 trieu")),
      signals(E("mua do duoi 15 trieu")))
check("0 tín hiệu (câu chào/mơ hồ) -> CHẶN, hỏi ngược",
      not is_ready(E("tu van giup em")) and missing_required(E("tu van giup em")) == ["tiêu chí tìm kiếm"],
      signals(E("tu van giup em")))
check("'mua may lanh' -> gợi ý hỏi thêm diện tích + ngân sách (khuyến nghị, không chặn)",
      set(recommended_to_ask(E("mua may lanh"))) == {"area_m2", "budget_max"},
      recommended_to_ask(E("mua may lanh")))
check("chỉ ngân sách, chưa biết ngành -> gợi ý hỏi category",
      "category" in recommended_to_ask(E("mua do duoi 15 trieu")),
      recommended_to_ask(E("mua do duoi 15 trieu")))
check("0 tín hiệu -> không gợi ý gì (hỏi tiêu chí trước)",
      recommended_to_ask(E("tu van giup em")) == [],
      recommended_to_ask(E("tu van giup em")))

print("\n== search: hành vi đề bài chấm ==")
need = E("Em muốn mua máy lạnh dưới 20 triệu cho phòng ngủ 18m², tiết kiệm điện, ít ồn")
res = search(products, need, k=3)
check("kịch bản đề bài trả đúng 3 sản phẩm", len(res.top) == 3, len(res.top))
check("mọi sản phẩm top ĐỀU có giá thật (không bịa)", all(s.product.has_price() for s in res.top))
check("mọi sản phẩm top trong ngân sách", all(s.product.price().num <= 20_000_000 for s in res.top))
check("top 3 ĐA DẠNG hãng (có trade-off để giải thích)",
      len({s.product.brand for s in res.top}) >= 2, [s.product.brand for s in res.top])
check("mọi sản phẩm có ít nhất 1 lý do giải thích được", all(s.reasons for s in res.top))
check("mọi lý do đều trỏ về cột catalog gốc (log nguồn)",
      all(r.source_field for s in res.top for r in s.reasons if r.criterion != "concept"))

need2 = E("may lanh cho phong 45m2 duoi 10 trieu")
res2 = search(products, need2, k=3)
# Không máy lạnh nào <=10tr có 'Phạm vi sử dụng' công bố phủ 45m² -> không
# được khẳng định hợp phòng -> top phải rỗng, KHÔNG bịa độ phù hợp.
check("ngân sách/phòng bất khả thi -> KHÔNG bịa hợp phòng, top rỗng",
      len(res2.top) == 0, [s.product.display_name for s in res2.top])
check("nhưng vẫn báo mẫu chưa xác nhận hợp phòng / chưa có giá thay vì im lặng",
      len(res2.no_price) > 0 or len(res2.unverified_fit) > 0)
check("mọi mẫu 'chưa xác nhận hợp phòng' đều KHÔNG có phạm vi sử dụng công bố",
      all(not ((a := s.product.facets.get("area")) and a.ok) for s in res2.unverified_fit),
      [s.product.display_name for s in res2.unverified_fit])

need3 = E("may lanh phong khach 30m2 duoi 15tr hang LG")
res3 = search(products, need3, k=3)
check("lọc hãng -> chỉ trả LG, không độn hãng khác",
      all(s.product.brand == "LG" for s in res3.top), [s.product.brand for s in res3.top])

check("sản phẩm thiếu dữ liệu -> có caveat nói rõ, không giấu",
      all(s.caveats for s in res.no_price if not s.product.has_price()))

# Chống "sản phẩm nào cũng tốt" - anti-pattern đề bài cấm.
need4 = E("may lanh 30m2 duoi 15tr")
res4 = search(products, need4, k=3)
check("KHÔNG sản phẩm nào được khen suông (mọi sp đều có nhược điểm thật)",
      all(s.caveats for s in res4.top),
      [s.product.display_name for s in res4.top if not s.caveats])

# 'Dàn lạnh: 36 - 45 dB' -> min=36 che giấu việc máy ồn 45dB khi chạy mạnh.
wide = [s for s in res4.top
        if (n := s.product.facets.get("noise_db")) and n.ok and n.hi - n.lo >= 8]
check("dải ồn rộng -> phải nói ra mức ồn nhất, không chỉ khoe mức êm",
      all(any("chạy mạnh" in r.text or "chênh nhiều" in c
              for r in s.reasons if r.criterion == "quiet" for c in s.caveats)
          for s in wide) if wide else True,
      [s.product.display_name for s in wide])

# Máy quá yếu so với phòng phải bị loại hẳn, không phải xếp hạng thấp.
weak = [s for s in res.top if (a := s.product.facets.get("area")) and a.ok and a.hi < 13]
check("máy quá yếu so với phòng 18m² bị loại khỏi top", not weak, weak)

print(f"\n{'='*60}")
if _fails:
    print(f"FAILED {len(_fails)}: {_fails}")
    sys.exit(1)
print("TẤT CẢ TEST PASS trên data thật")
