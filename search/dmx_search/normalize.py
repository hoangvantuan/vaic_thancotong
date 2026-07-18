"""Chuẩn hoá giá trị thô từ Spec_cate_gia thành facet có kiểu.

Mọi parser ở đây trả về Value: phân biệt 3 trạng thái mà guardrail cần
(có giá trị / hãng không công bố / thiếu hẳn). Không bao giờ đoán số.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from enum import Enum
from typing import Any


class State(str, Enum):
    OK = "ok"                    # có giá trị parse được
    UNDISCLOSED = "undisclosed"  # hãng không công bố / đang cập nhật
    NOT_APPLICABLE = "n/a"       # "Không", "Không có" - sản phẩm không có tính năng
    MISSING = "missing"          # ô trống
    UNPARSED = "unparsed"        # có text nhưng parser không hiểu -> giữ raw, không bịa


# Các sentinel gặp thật trong data, so khớp sau khi fold dấu + lower.
_UNDISCLOSED = {"hang khong cong bo", "dang cap nhat", "chua co thong tin"}
_NOT_APPLICABLE = {"khong", "khong co"}


@dataclass(frozen=True)
class Value:
    """Một facet đã chuẩn hoá. `raw` luôn giữ để trace nguồn khi trả lời khách."""

    state: State
    raw: Any = None
    num: float | None = None
    lo: float | None = None
    hi: float | None = None
    tags: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return self.state is State.OK

    def explain_missing(self) -> str:
        """Câu trả lời bình dân khi không có số - dùng thay vì bịa."""
        return {
            State.UNDISCLOSED: "hãng chưa công bố thông số này",
            State.NOT_APPLICABLE: "sản phẩm này không có",
            State.MISSING: "chưa có dữ liệu",
            State.UNPARSED: "dữ liệu ghi không rõ ràng",
        }.get(self.state, "chưa có dữ liệu")


def fold(s: str) -> str:
    """Bỏ dấu tiếng Việt + lower. 'Máy Lạnh' -> 'may lanh'. Cho khớp query không dấu."""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace("đ", "d").replace("Đ", "D").lower().strip()


def _sentinel(raw: Any) -> Value | None:
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return Value(State.MISSING, raw)
    f = fold(raw)
    if f in _UNDISCLOSED:
        return Value(State.UNDISCLOSED, raw)
    if f in _NOT_APPLICABLE:
        return Value(State.NOT_APPLICABLE, raw)
    return None


def parse_price(raw: Any) -> Value:
    """'17630000' | 17630000 -> 17_630_000 VND. Giá chỉ fill ~15-60% nên MISSING là bình thường."""
    if (s := _sentinel(raw)) is not None:
        return s
    if isinstance(raw, (int, float)):
        v = float(raw)
    else:
        digits = re.sub(r"[^\d]", "", str(raw))
        if not digits:
            return Value(State.UNPARSED, raw)
        v = float(digits)
    # Giá điện máy hợp lệ: 100k - 500tr. Ngoài khoảng này là data lỗi, không dùng.
    if not (100_000 <= v <= 500_000_000):
        return Value(State.UNPARSED, raw)
    return Value(State.OK, raw, num=v)


def parse_area_range(raw: Any) -> Value:
    """'Từ 15 - 20m² (từ 40 đến 60m³)' -> lo=15 hi=20. 'Dưới 15m²' -> lo=0 hi=15.

    Chỉ 17 giá trị distinct trong may-lanh nên regex phủ hết - không cần LLM.
    Bắt buộc cắt phần (m³) trước, nếu không sẽ nuốt nhầm 40-60.
    """
    if (s := _sentinel(raw)) is not None:
        return s
    txt = str(raw).split("(")[0]
    if not re.search(r"m\s*[²2]", txt):
        return Value(State.UNPARSED, raw)
    nums = [float(n) for n in re.findall(r"(\d+(?:[.,]\d+)?)", txt.replace(",", "."))]
    if not nums:
        return Value(State.UNPARSED, raw)
    f = fold(txt)
    if "duoi" in f:
        return Value(State.OK, raw, lo=0.0, hi=nums[0])
    if "tren" in f:
        return Value(State.OK, raw, lo=nums[0], hi=999.0)
    if len(nums) >= 2:
        return Value(State.OK, raw, lo=min(nums[:2]), hi=max(nums[:2]))
    return Value(State.OK, raw, lo=nums[0], hi=nums[0])


def parse_people_range(raw: Any) -> Value:
    """'3 - 4 người' -> lo=3 hi=4. 'Trên 5 người' -> lo=5 hi=99. Đúng 5 giá trị distinct."""
    if (s := _sentinel(raw)) is not None:
        return s
    f = fold(raw)
    nums = [float(n) for n in re.findall(r"(\d+)", f)]
    if not nums:
        return Value(State.UNPARSED, raw)
    if "tren" in f:
        return Value(State.OK, raw, lo=nums[0], hi=99.0)
    if "duoi" in f:
        return Value(State.OK, raw, lo=0.0, hi=nums[0])
    if len(nums) >= 2:
        return Value(State.OK, raw, lo=min(nums[:2]), hi=max(nums[:2]))
    return Value(State.OK, raw, lo=nums[0], hi=nums[0])


def parse_energy_label(raw: Any) -> Value:
    """'5 sao (Hiệu suất năng lượng 6.23)' -> num=5 (sao), hi=6.23 (COP).

    COP là chỉ số so sánh tiết kiệm điện tốt hơn số sao (mịn hơn), giữ cả hai.
    """
    if (s := _sentinel(raw)) is not None:
        return s
    txt = str(raw)
    stars = re.search(r"(\d)\s*sao", fold(txt))
    cop = re.search(r"(\d+(?:[.,]\d+)?)\s*\)?\s*$", txt.replace(",", "."))
    if not stars and not cop:
        return Value(State.UNPARSED, raw)
    return Value(
        State.OK,
        raw,
        num=float(stars.group(1)) if stars else None,
        hi=float(cop.group(1)) if cop else None,
    )


def parse_noise(raw: Any) -> Value:
    """'Dàn lạnh: 45/34/29 dB - Dàn nóng: 51 dB' -> num=29 (min dàn lạnh).

    Dàn lạnh mới là cái đặt trong phòng ngủ -> đó là con số khách quan tâm.
    Dàn nóng để ngoài trời, không tính. Lấy MIN vì đó là chế độ chạy êm nhất.
    """
    if (s := _sentinel(raw)) is not None:
        return s
    txt = str(raw)
    f = fold(txt)
    # Cắt bỏ đoạn dàn nóng nếu có nhãn rõ ràng.
    if "dan nong" in f:
        idx = f.index("dan nong")
        indoor_txt = txt[:idx]
    else:
        indoor_txt = txt
    nums = [float(n) for n in re.findall(r"(\d+(?:[.,]\d+)?)", indoor_txt.replace(",", "."))]
    # dB hợp lệ 15-70; loại số rác lọt vào (vd "2024" trong ghi chú).
    nums = [n for n in nums if 15 <= n <= 70]
    if not nums:
        return Value(State.UNPARSED, raw)
    return Value(State.OK, raw, num=min(nums), lo=min(nums), hi=max(nums))


def parse_volume_liters(raw: Any) -> Value:
    """'180 lít' -> 180. Sentinel 'Hãng không công bố' chiếm 159/1692 -> phải bắt."""
    if (s := _sentinel(raw)) is not None:
        return s
    m = re.search(r"(\d+(?:[.,]\d+)?)", str(raw).replace(",", "."))
    if not m:
        return Value(State.UNPARSED, raw)
    v = float(m.group(1))
    if not (10 <= v <= 1200):
        return Value(State.UNPARSED, raw)
    return Value(State.OK, raw, num=v)


def parse_tags(raw: Any) -> Value:
    """'Hẹn giờ bật, tắt máy | Sleep Mode | ...' -> tuple tag đã fold.

    Tách theo '|' - KHÔNG tách theo ',' vì bản thân tag có dấu phẩy
    ('Hẹn giờ bật, tắt máy' là MỘT tag).
    """
    if (s := _sentinel(raw)) is not None:
        return Value(s.state, raw, tags=())
    parts = [p.strip() for p in str(raw).split("|")]
    return Value(State.OK, raw, tags=tuple(p for p in parts if p))
