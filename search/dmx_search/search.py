"""Xếp hạng sản phẩm theo Need, có breakdown giải thích được.

Ba quyết định thiết kế quan trọng:

1. NGÂN SÁCH LÀ HARD FILTER, nhưng chỉ áp lên sản phẩm CÓ giá.
   85% sản phẩm thiếu giá. Nếu loại hết -> mất 85% catalog. Nếu giữ lẫn vào
   top 3 -> không trả lời được "bao nhiêu tiền" -> vô dụng cho khách.
   Giải pháp: chia hai rổ. Rổ chính = có giá & trong ngân sách (dùng cho
   top 3). Rổ phụ = thiếu giá nhưng khớp nhu cầu (báo riêng: "còn N mẫu
   nữa hợp nhu cầu nhưng chưa có giá, em kiểm tra giúp anh/chị nhé").
   Không bịa giá, cũng không giấu sản phẩm.

2. KHÔNG DÙNG BTU để xếp hạng máy lạnh: chỉ ~16/1039 sản phẩm có BTU thật.
   Dùng 'Phạm vi sử dụng' (fill 945/1039) - vốn đã là kết quả quy đổi BTU
   sang diện tích do chính hãng công bố. Chính xác hơn và phủ rộng hơn.

3. ĐIỂM LÀ TỔNG CÓ TRỌNG SỐ CỦA CÁC TIÊU CHÍ RỜI, mỗi tiêu chí giữ lại
   lý do dạng chữ. LLM chỉ diễn đạt lại reasons, không tự tính điểm ->
   không bịa được.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .catalog import Product
from .concepts import CONCEPTS
from .extract import Need
from .normalize import State, Value


def _vnd(v: float) -> str:
    """14590000 -> '14.590.000đ' (dấu chấm phân cách nghìn kiểu Việt Nam)."""
    return f"{v:,.0f}".replace(",", ".") + "đ"


@dataclass
class Reason:
    criterion: str
    score: float          # 0..1
    weight: float
    text: str             # câu giải thích bình dân, KHÔNG thuật ngữ
    source_field: str | None = None   # cột catalog gốc -> log nguồn
    source_value: str | None = None

    @property
    def contribution(self) -> float:
        return self.score * self.weight


@dataclass
class Scored:
    product: Product
    reasons: list[Reason]
    total: float
    caveats: list[str] = field(default_factory=list)   # nhược điểm thật, chống "cái nào cũng tốt"

    def breakdown(self) -> str:
        rows = [f"  {r.criterion:16} {r.score:.2f} x{r.weight:.1f} = {r.contribution:+.2f}  {r.text}"
                for r in self.reasons]
        return "\n".join(rows)


# Trọng số mặc định; điều chỉnh theo ngữ cảnh phòng.
BASE_WEIGHTS = {
    "fit": 3.0,        # đúng diện tích/số người - quan trọng nhất
    "budget": 2.0,
    "energy": 1.5,
    "quiet": 1.0,
    "concept": 1.0,
    "brand": 0.5,
}


def _weights(need: Need) -> dict[str, float]:
    w = dict(BASE_WEIGHTS)
    if need.room == "bedroom" or "quiet" in need.concepts or "sleep" in need.concepts:
        w["quiet"] = 2.5      # phòng ngủ: độ ồn thành tiêu chí chính
    if need.wants_energy_saving:
        w["energy"] = 2.5
    if need.wants_cheap:
        w["budget"] = 3.0
    return w


def _score_fit(p: Product, need: Need) -> Reason | None:
    """Khớp diện tích (may-lanh) hoặc số người (tu-lanh/may-giat)."""
    if need.area_m2 is not None and (a := p.facets.get("area")) and a.ok:
        lo, hi = a.lo, a.hi
        if lo <= need.area_m2 <= hi:
            s, txt = 1.0, f"vừa đúng phòng {need.area_m2:g}m² (hãng khuyên dùng cho {lo:g}-{hi:g}m²)"
        elif need.area_m2 < lo:
            over = lo - need.area_m2
            s = max(0.0, 1.0 - over / 10)
            txt = f"hơi dư công suất cho phòng {need.area_m2:g}m² (máy này cho {lo:g}-{hi:g}m²), chạy vẫn mát nhưng tốn tiền hơn mức cần"
        else:
            short = need.area_m2 - hi
            s = max(0.0, 1.0 - short / 5)   # thiếu công suất phạt nặng hơn dư
            txt = f"yếu so với phòng {need.area_m2:g}m² (máy này chỉ cho {lo:g}-{hi:g}m²), phòng lâu mát và máy phải chạy hết sức"
        return Reason("fit", s, 0, txt, "Phạm vi sử dụng", str(a.raw))

    if need.people is not None and (pe := p.facets.get("people")) and pe.ok:
        lo, hi = pe.lo, pe.hi
        if lo <= need.people <= hi:
            s, txt = 1.0, f"vừa cho nhà {need.people:g} người (hãng khuyên {pe.raw})"
        elif need.people < lo:
            s = max(0.0, 1.0 - (lo - need.people) / 4)
            txt = f"hơi rộng so với {need.people:g} người (hãng khuyên {pe.raw})"
        else:
            s = max(0.0, 1.0 - (need.people - hi) / 2)
            txt = f"hơi chật cho {need.people:g} người (hãng khuyên {pe.raw})"
        return Reason("fit", s, 0, txt, "Số người sử dụng", str(pe.raw))
    return None


def _score_budget(p: Product, need: Need) -> Reason | None:
    pr = p.price()
    if not pr.ok or need.budget_max is None:
        return None
    price = pr.num
    if price <= need.budget_max:
        # Càng sát trần ngân sách thường càng nhiều tính năng -> không phạt rẻ,
        # nhưng thưởng nhẹ cho việc tiết kiệm được tiền.
        saved = need.budget_max - price
        s = min(1.0, 0.6 + saved / need.budget_max)
        # Định dạng số riêng rồi mới ghép câu: .replace(",", ".") trên cả câu
        # sẽ biến luôn dấu phẩy ngắt câu thành dấu chấm.
        txt = f"giá {_vnd(price)}, rẻ hơn mức anh/chị định chi {_vnd(saved)}"
        return Reason("budget", s, 0, txt, "giá khuyến mãi/giá gốc", _vnd(price))
    return Reason("budget", 0.0, 0, f"giá {_vnd(price)}, vượt ngân sách",
                  "giá", _vnd(price))


def _score_energy(p: Product, need: Need) -> Reason | None:
    e = p.facets.get("energy")
    if e and e.ok and e.hi:            # COP - mịn hơn số sao
        cop = e.hi
        s = max(0.0, min(1.0, (cop - 3.5) / 2.5))   # 3.5 kém .. 6.0 rất tốt
        star = f"{int(e.num)} sao" if e.num else "chưa có nhãn"
        txt = f"{star}, tiết kiệm điện {'rất tốt' if cop >= 5.5 else 'tốt' if cop >= 4.8 else 'trung bình'} (chỉ số {cop})"
        return Reason("energy", s, 0, txt, "Nhãn năng lượng", str(e.raw))
    if p.inverter:
        specs = p.raw.get("specs") or {}
        tech = specs.get("Công nghệ tiết kiệm điện") or specs.get("Loại Inverter")
        return Reason("energy", 0.6, 0, "có Inverter nên tiết kiệm điện hơn máy thường",
                      "Công nghệ tiết kiệm điện", str(tech))
    return None


def _score_quiet(p: Product, need: Need) -> Reason | None:
    n = p.facets.get("noise_db")
    if n and n.ok:
        # n.num/n.lo = mức êm nhất, n.hi = mức khi chạy hết công suất.
        # Chấm theo mức êm nhất NHƯNG kéo về phía mức ồn nhất, vì máy chỉ
        # chạy ở mức êm khi phòng đã đủ lạnh. Chấm bằng min sẽ khen nhầm
        # máy "36 - 45 dB" là êm - đó là nói tốt cho sản phẩm không đáng.
        quiet_db, loud_db = n.lo, n.hi
        eff = quiet_db * 0.6 + loud_db * 0.4 if loud_db > quiet_db else quiet_db
        s = max(0.0, min(1.0, (45 - eff) / 20))    # 45dB ồn .. 25dB rất êm
        if eff <= 25:
            txt = f"rất êm, gần như không nghe thấy khi ngủ ({quiet_db:g}dB)"
        elif eff <= 32:
            txt = f"chạy êm, ngủ không bị làm phiền ({quiet_db:g}dB)"
        elif eff <= 40:
            txt = f"tiếng ồn vừa phải ({quiet_db:g}dB)"
        else:
            txt = f"khá ồn, để phòng ngủ sẽ hơi khó chịu ({quiet_db:g}dB)"
        if loud_db > quiet_db:
            txt += f", lúc chạy mạnh lên tới {loud_db:g}dB"
        return Reason("quiet", s, 0, txt, "Độ ồn", str(n.raw))
    if "quiet" in p.concepts:
        return Reason("quiet", 0.5, 0, "hãng ghi có chế độ chạy êm nhưng không công bố số đo",
                      "Tiện ích", None)
    return None


def _score_concepts(p: Product, need: Need) -> Reason | None:
    if not need.concepts:
        return None
    want = set(need.concepts)
    got = want & p.concepts
    if not got:
        return None
    labels = [CONCEPTS[c].label for c in got if c in CONCEPTS]
    return Reason("concept", len(got) / len(want), 0,
                  "có " + ", ".join(labels), "Tiện ích", None)


def _caveats(p: Product, need: Need, reasons: list[Reason]) -> list[str]:
    """Nhược điểm THẬT lấy từ data - ép bot không nói sản phẩm nào cũng tốt.

    Ngưỡng đặt ở mức "chưa xuất sắc" (< 0.6) chứ không phải "tệ" (< 0.4):
    một sản phẩm trung bình mà không có caveat nào thì bot sẽ khen suông,
    đúng anti-pattern đề bài cấm.
    """
    out = []
    for r in reasons:
        if r.criterion == "fit" and r.score < 0.9:
            out.append(r.text)
        if r.criterion in ("quiet", "energy") and r.score < 0.6:
            out.append(r.text)
        if r.criterion == "budget" and r.score <= 0.0:
            out.append(r.text)

    # Dải ồn rộng: min che giấu sự thật là máy rất ồn khi chạy hết công suất.
    n = p.facets.get("noise_db")
    if n and n.ok and n.hi - n.lo >= 8:
        out.append(f"độ ồn chênh nhiều theo mức gió ({n.lo:g}-{n.hi:g}dB), "
                   f"chỉ êm khi phòng đã đủ lạnh")

    # Thiếu dữ liệu cũng là caveat phải nói ra, không giấu.
    for key, label in (("noise_db", "độ ồn"), ("energy", "mức tiêu thụ điện")):
        v = p.facets.get(key)
        if v and not v.ok and v.state in (State.UNDISCLOSED, State.MISSING):
            out.append(f"{label}: {v.explain_missing()}")
    if not p.has_price():
        out.append(f"giá: {p.price().explain_missing()}")
    return out


def score(p: Product, need: Need, w: dict[str, float]) -> Scored:
    reasons: list[Reason] = []
    for fn in (_score_fit, _score_budget, _score_energy, _score_quiet, _score_concepts):
        if (r := fn(p, need)) is not None:
            r.weight = w.get(r.criterion, 1.0)
            reasons.append(r)

    if need.brands and p.brand in need.brands:
        reasons.append(Reason("brand", 1.0, w["brand"], f"đúng hãng {p.brand} anh/chị hỏi", "brand", p.brand))

    # Lý do TỐI THIỂU khi khách nêu ngành: để SP đúng ngành luôn có ít nhất 1 lý
    # do (không rớt vì luật "0 lý do bị loại"), kể cả ngành chưa cấu hình facet.
    # Trọng số nhỏ để không lấn các tiêu chí thực (fit/budget...).
    if need.category is not None and p.slug == need.category:
        reasons.append(Reason("category", 1.0, 0.3,
                              f"đúng loại {p.category} anh/chị hỏi", "category", p.category))

    total = sum(r.contribution for r in reasons)
    return Scored(p, reasons, total, _caveats(p, need, reasons))


@dataclass
class Results:
    top: list[Scored]                  # có giá, trong ngân sách, ĐÃ xác nhận hợp phòng -> tư vấn được
    no_price: list[Scored]             # khớp nhu cầu nhưng thiếu giá -> báo riêng
    unverified_fit: list[Scored]       # có giá nhưng hãng chưa công bố phạm vi -> không khẳng định hợp phòng
    total_matched: int
    filtered_out_by_budget: int


# Category mà tiêu chí "hợp phòng/số người" là quyết định: thiếu nó thì KHÔNG
# được xếp vào top khi khách đã nói rõ diện tích/số người. Không bịa độ phù hợp.
_FIT_CRITICAL = {"may-lanh", "tu-lanh", "may-giat"}


def _fit_unknown(p: Product, need: Need) -> bool:
    """True nếu khách đã nêu ràng buộc quyết định mà sản phẩm KHÔNG có dữ liệu.

    VD: khách cho phòng 45m² nhưng máy lạnh này hãng không công bố 'Phạm vi
    sử dụng' -> ta không có cơ sở khẳng định nó hợp -> không đưa lên top,
    tránh gợi ý sai kiểu bán máy 1 HP cho phòng 45m².
    """
    if p.slug not in _FIT_CRITICAL:
        return False
    if need.area_m2 is not None:
        a = p.facets.get("area")
        return not (a and a.ok)
    if need.people is not None:
        pe = p.facets.get("people")
        return not (pe and pe.ok)
    return False


def _hard_filter(p: Product, need: Need) -> bool:
    if need.category and p.slug != need.category:
        return False
    if need.brands and p.brand not in need.brands:
        return False
    # Loại thẳng máy quá yếu so với phòng: mua về không mát, không phải trade-off.
    if need.area_m2 is not None and (a := p.facets.get("area")) and a.ok:
        if need.area_m2 > a.hi + 5:
            return False
    return True


def _diversify(cands: list[Scored], k: int) -> list[Scored]:
    """Top-k đa dạng kiểu MMR: không lấy 3 máy cùng hãng cùng tầm giá.

    Đề bài muốn thấy trade-off - 3 sản phẩm giống hệt thì không có gì để đánh
    đổi. Mỗi vòng chọn ứng viên tối đa hoá (điểm - phạt trùng lặp so với
    những cái ĐÃ chọn), thay vì duyệt tuyến tính theo điểm.

    Phạt tính theo tỉ lệ điểm để không phụ thuộc thang điểm tuyệt đối.
    """
    pool = sorted(cands, key=lambda x: -x.total)
    if not pool:
        return []

    out: list[Scored] = [pool[0]]      # hạng 1 luôn là điểm cao nhất
    rest = pool[1:]

    while len(out) < k and rest:
        chosen_brands = [s.product.brand for s in out]
        chosen_bands = {
            int(s.product.price().num // 5_000_000)
            for s in out if s.product.price().ok
        }
        best, best_adj = None, float("-inf")
        for c in rest:
            pr = c.product.price()
            band = int(pr.num // 5_000_000) if pr.ok else -1
            penalty = 0.0
            if c.product.brand in chosen_brands:
                penalty += 0.20 * chosen_brands.count(c.product.brand)
            if band in chosen_bands:
                penalty += 0.12
            adj = c.total * (1.0 - penalty)
            if adj > best_adj:
                best, best_adj = c, adj
        out.append(best)
        rest.remove(best)
    return out


def search(products: list[Product], need: Need, k: int = 3) -> Results:
    matched = [p for p in products if _hard_filter(p, need)]
    w = _weights(need)

    priced_in_budget: list[Scored] = []
    priced_over: list[Scored] = []
    unpriced: list[Scored] = []
    unverified: list[Scored] = []

    for p in matched:
        s = score(p, need, w)
        # Không có lý do nào -> không tư vấn suông -> loại khỏi mọi rổ.
        # (VD chỉ có mình category, ngành chưa cấu hình facet: SP không sinh
        # được reason -> không đưa ra cho khách.)
        if not s.reasons:
            continue
        if not p.has_price():
            unpriced.append(s)
            continue
        if need.budget_max is not None and p.price().num > need.budget_max:
            priced_over.append(s)
            continue
        # Có giá & trong ngân sách, nhưng thiếu dữ liệu quyết định (phạm vi/số
        # người) khi khách đã nêu -> không khẳng định hợp, tách riêng.
        if _fit_unknown(p, need):
            unverified.append(s)
        else:
            priced_in_budget.append(s)

    top = _diversify(priced_in_budget, k)
    # Chỉ giữ rổ phụ nếu thật sự khớp nhu cầu (điểm dương), tránh nhiễu.
    no_price = sorted([s for s in unpriced if s.total > 0], key=lambda x: -x.total)[:5]
    unverified_fit = sorted(unverified, key=lambda x: -x.total)[:5]

    return Results(top, no_price, unverified_fit, len(matched), len(priced_over))
