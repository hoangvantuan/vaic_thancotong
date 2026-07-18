"""Trích nhu cầu có cấu trúc từ câu nói tự nhiên của khách.

Chạy thuần regex + lexicon, không gọi LLM: đạt <50ms nên phần ngân sách
latency còn lại dành hết cho việc sinh lời giải thích.

Xử lý được: không dấu, viết tắt tiền tệ ("20 củ", "20tr", "20 triệu"),
đơn vị diện tích ("18m2", "18 m²"), số người, brand, và các concept tiện ích.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .concepts import QUERY_LEXICON, ROOM_LEXICON
from .normalize import fold


@dataclass
class Need:
    """Nhu cầu đã trích. None = khách chưa nói -> đây là thứ cần hỏi ngược."""

    category: str | None = None
    budget_max: float | None = None
    budget_min: float | None = None
    area_m2: float | None = None
    people: float | None = None
    room: str | None = None
    brands: list[str] = field(default_factory=list)
    concepts: list[str] = field(default_factory=list)   # quiet, sleep, wifi...
    wants_energy_saving: bool = False
    wants_cheap: bool = False
    raw_text: str = ""

    # Kiểm tra Need đủ/thiếu để hỏi ngược nằm ở tầng agent (`clarify.py`),
    # KHÔNG phải ở đây: `extract` chỉ trích, không phán xét đủ/thiếu.


# --- Tiền: "20 triệu", "20tr", "20 củ", "20 chai", "15,5 triệu", "9tr5" ---
_MONEY_UNIT = r"(?:trieu|tr|cu|chai|m)\b"
_RE_MONEY_RANGE = re.compile(
    rf"(?:tu\s*)?(\d+(?:[.,]\d+)?)\s*(?:den|-|toi|~)\s*(\d+(?:[.,]\d+)?)\s*{_MONEY_UNIT}"
)
_RE_MONEY_UNDER = re.compile(
    rf"(?:duoi|khoang|tam|toi da|max|<=?|khong qua|it hon)\s*(\d+(?:[.,]\d+)?)\s*{_MONEY_UNIT}"
)
# "9tr5" = 9.5 triệu (văn nói rất phổ biến)
_RE_MONEY_SPLIT = re.compile(r"(\d+)\s*tr\s*(\d)\b")
_RE_MONEY_BARE = re.compile(rf"(\d+(?:[.,]\d+)?)\s*{_MONEY_UNIT}")
_RE_MONEY_VND = re.compile(r"(\d[\d.,]{5,})\s*(?:vnd|d|dong)?\b")

_RE_AREA = re.compile(r"(\d+(?:[.,]\d+)?)\s*m\s*(?:2|²|vuong)\b")
_RE_PEOPLE = re.compile(r"(\d+)\s*(?:nguoi|nhan khau|thanh vien)\b")
_RE_FAMILY = re.compile(r"gia dinh\s*(\d+)")


def _num(s: str) -> float:
    return float(s.replace(",", ".").replace(".", ".", 1)) if "," in s or "." in s else float(s)


def _money_to_vnd(v: float) -> float:
    return v * 1_000_000


def extract_money(f: str) -> tuple[float | None, float | None]:
    """-> (min, max) VND. Trả None nếu khách chưa nói giá."""
    if m := _RE_MONEY_RANGE.search(f):
        return _money_to_vnd(_num(m.group(1))), _money_to_vnd(_num(m.group(2)))
    if m := _RE_MONEY_UNDER.search(f):
        return None, _money_to_vnd(_num(m.group(1)))
    if m := _RE_MONEY_SPLIT.search(f):          # "9tr5" -> 9.5tr
        return None, _money_to_vnd(float(f"{m.group(1)}.{m.group(2)}"))
    if m := _RE_MONEY_BARE.search(f):
        return None, _money_to_vnd(_num(m.group(1)))
    if m := _RE_MONEY_VND.search(f):            # "15000000"
        v = float(re.sub(r"[.,]", "", m.group(1)))
        if v >= 100_000:
            return None, v
    return None, None


def _fuzzy_category(f: str, category_hints: dict[str, list[str]]) -> str | None:
    """Khớp MỜ theo từ khi không hint nào khớp nguyên chuỗi.

    'may pha ca phe' vs hint 'may xay ca phe': trùng {may, ca, phe} = 3/4 từ
    -> nhận. Điều kiện: trùng >=2 từ VÀ phủ >=75% số từ của hint - hint 1 từ
    ('loa', 'tivi') không bao giờ vào đây (đã có khớp nguyên chuỗi lo).
    Ngưỡng 75% chứ không thấp hơn: 'may loc khong khi' trùng 'may loc nuoc'
    2/3 từ (0.67) là ngành KHÁC HẲN - phải loại, thà None để agent hỏi lại.
    Hoà điểm -> ưu tiên hint nhiều từ hơn (cụ thể hơn).
    """
    qtokens = set(f.split())
    best: str | None = None
    best_key = (0.0, 0)                      # (độ phủ, số từ của hint)
    for cat, words in category_hints.items():
        for w in words:
            wt = w.replace(",", " ").split()
            if len(wt) < 2:
                continue
            common = sum(1 for t in wt if t in qtokens)
            if common < 2:
                continue
            key = (common / len(wt), len(wt))
            if key[0] >= 0.75 and key > best_key:
                best, best_key = cat, key
    return best


def extract(text: str, category_hints: dict[str, list[str]], known_brands: set[str]) -> Need:
    """Câu khách -> Need. `category_hints`/`known_brands` lấy từ catalog thật."""
    f = fold(text)
    n = Need(raw_text=text)

    n.budget_min, n.budget_max = extract_money(f)

    if m := _RE_AREA.search(f):
        a = _num(m.group(1))
        if 3 <= a <= 500:          # ngoài khoảng này là số rác, không phải diện tích
            n.area_m2 = a

    if m := (_RE_PEOPLE.search(f) or _RE_FAMILY.search(f)):
        p = float(m.group(1))
        if 1 <= p <= 20:
            n.people = p

    # Dò category theo hint DÀI/CỤ THỂ trước: 'phu kien may lanh' phải thắng
    # 'may lanh', 'loa tai nghe' thắng 'loa'. Khớp trọn từ (\b) để 'loa' không
    # dính trong 'phao', 'pc' không dính trong 'pcs'...
    candidates = sorted(
        ((w, cat) for cat, words in category_hints.items() for w in words),
        key=lambda x: len(x[0]), reverse=True,
    )
    for w, cat in candidates:
        if re.search(rf"\b{re.escape(w)}\b", f):
            n.category = cat
            break

    # Không hint nào khớp NGUYÊN CHUỖI -> khớp MỜ theo từ: khách gọi tên gần
    # đúng ('may pha ca phe', 'may ca phe') vẫn bắt về category gần nhất trong
    # data ('may xay ca phe': trùng 3/4 từ). Chỉ nhận khi trùng >=2 từ và phủ
    # >=60% từ của tên category - dưới ngưỡng thì thà trả None để agent hỏi lại
    # còn hơn đoán bừa sang ngành khác.
    if n.category is None:
        n.category = _fuzzy_category(f, category_hints)

    for b in known_brands:
        # Chặn khớp nhầm chuỗi con: "lg" không được khớp trong "gia dinh lgi"
        if re.search(rf"\b{re.escape(fold(b))}\b", f):
            n.brands.append(b)

    for room, words in ROOM_LEXICON.items():
        # Bắt buộc khớp trọn từ: 'ngu' KHÔNG được khớp trong 'nguoi'.
        if any(re.search(rf"\b{re.escape(w)}\b", f) for w in words):
            n.room = room
            break

    for key, words in QUERY_LEXICON.items():
        if not any(re.search(rf"\b{re.escape(w)}\b", f) for w in words):
            continue
        if key == "_energy":
            n.wants_energy_saving = True
        elif key == "_cheap":
            n.wants_cheap = True
        elif key == "_premium":
            pass
        else:
            n.concepts.append(key)

    return n
