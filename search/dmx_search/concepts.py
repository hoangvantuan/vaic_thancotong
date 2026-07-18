"""Ánh xạ ngôn ngữ khách hàng -> facet/tag trong catalog.

Hai chiều ánh xạ, đều cần thiết:
  1. QUERY_LEXICON: khách nói "ít ồn" / "it on" / "chạy êm" -> concept QUIET
  2. TAG_RULES:     catalog ghi "Best Sleep" / "Chế độ ngủ ngon" -> concept SLEEP

Vì sao rule chứ không phải embedding: các hãng đặt tên marketing tuỳ hứng
("Sleep Curve", "Dream Mode", "Good Sleep" đều là một thứ). Embedding gom
được các biến thể gần nghĩa nhưng cũng gom nhầm "Chế độ ngủ đêm tránh buốt"
với "Chức năng hút ẩm". Rule cho ta kiểm soát và giải thích được - đề bài
yêu cầu explainable. Chỉ 189 tag nên rule là khả thi.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .normalize import fold


@dataclass(frozen=True)
class Concept:
    key: str
    label: str            # tên bình dân để giải thích cho khách
    tag_any: tuple[str, ...] = ()   # tag khớp nếu chứa BẤT KỲ chuỗi nào (đã fold)
    tag_not: tuple[str, ...] = ()   # loại trừ, chặn false-positive


# --- Concept rút ra từ tag thật của may-lanh (189 tag distinct) ---
CONCEPTS: dict[str, Concept] = {
    "quiet": Concept(
        key="quiet",
        label="chạy êm",
        tag_any=("sieu em", "yen tinh", "quiet", "giam tieng on", "em diu", "airfree"),
    ),
    "sleep": Concept(
        key="sleep",
        label="có chế độ ngủ đêm",
        # Gom mọi tên marketing: Sleep Mode/Best Sleep/Good Sleep/Sleep Curve/Dream Mode
        tag_any=("ngu dem", "sleep", "che do ngu", "van hanh khi ngu", "dream mode", "ngu ngon"),
    ),
    "kids_elderly": Concept(
        key="kids_elderly",
        label="hợp với trẻ nhỏ và người già",
        tag_any=("tre em", "nguoi gia", "tre nho", "baby", "thoi gio de chiu"),
        tag_not=("khoa tre em",),  # khoá an toàn, không phải tiện nghi gió
    ),
    "wifi": Concept(
        key="wifi",
        label="điều khiển bằng điện thoại",
        tag_any=("wi-fi", "wifi", "dien thoai", "smartthings", "comfort cloud", "mobile"),
    ),
    "self_clean": Concept(
        key="self_clean",
        label="tự làm sạch",
        tag_any=("tu lam sach", "self clean"),
    ),
    "dehumidify": Concept(
        key="dehumidify",
        label="hút ẩm",
        tag_any=("hut am", "khu am", "kiem soat do am"),
    ),
    "anti_corrosion": Concept(
        key="anti_corrosion",
        label="chống ăn mòn (hợp vùng biển)",
        tag_any=("chong an mon", "bluefin", "blue fin", "golden fin", "goldguard", "durafin"),
    ),
    "timer": Concept(
        key="timer",
        label="hẹn giờ bật tắt",
        tag_any=("hen gio",),
    ),
    "auto_restart": Concept(
        key="auto_restart",
        label="tự bật lại khi có điện",
        tag_any=("tu khoi dong lai", "tu dong khoi dong"),
    ),
}


# --- Từ khách hàng thật sự gõ -> concept / facet intent ---
# Bao gồm cả dạng không dấu, viết tắt, văn nói. Tất cả key đã fold.
QUERY_LEXICON: dict[str, list[str]] = {
    # concept tiện ích
    "quiet": ["it on", "khong on", "chay em", "em", "yen tinh", "on ao", "silent", "quiet", "khong ku", "em ai"],
    "sleep": ["ngu dem", "che do ngu", "ban dem", "buoi toi", "sleep"],
    "kids_elderly": ["tre em", "tre nho", "em be", "nguoi gia", "ong ba", "con nho", "baby"],
    "wifi": ["wifi", "wi-fi", "dieu khien tu xa", "dien thoai", "smart", "thong minh", "app"],
    "self_clean": ["tu lam sach", "tu ve sinh", "khong can ve sinh", "self clean"],
    "dehumidify": ["hut am", "am uot", "nom", "no'm", "am"],
    "anti_corrosion": ["gan bien", "vung bien", "nuoc man", "an mon", "ven bien", "hai san"],
    "timer": ["hen gio", "tu tat", "tu bat"],
    # intent trên facet số
    "_energy": ["tiet kiem dien", "it ton dien", "ton dien", "hoa don dien", "tien dien", "eco", "inverter", "tiet kiem"],
    "_cheap": ["re", "gia re", "tiet kiem tien", "binh dan", "vua tien", "it tien"],
    "_premium": ["cao cap", "xin", "tot nhat", "xin xo", "hang tot"],
}


# Từ khoá suy ra loại phòng -> ảnh hưởng trọng số (phòng ngủ ưu tiên êm).
ROOM_LEXICON: dict[str, list[str]] = {
    "bedroom": ["phong ngu", "ngu", "phong con", "phong be"],
    "living": ["phong khach", "khach", "sinh hoat", "phong an"],
    "office": ["van phong", "cong ty", "lam viec", "phong hop"],
}


def tag_to_concepts(tag: str) -> list[str]:
    """Một tag catalog -> các concept nó thoả. Dùng khi index sản phẩm."""
    f = fold(tag)
    out = []
    for c in CONCEPTS.values():
        if any(x in f for x in c.tag_not):
            continue
        if any(x in f for x in c.tag_any):
            out.append(c.key)
    return out


def is_inverter(raw_energy_tech: str | None) -> bool:
    """'Inverter | ECO tích hợp A.I', 'Dual Inverter', 'J-Tech Inverter' -> True.

    'Không có' -> False. Inverter là tín hiệu tiết kiệm điện mạnh nhất có
    fill rate cao, dùng bù cho việc 'Điện năng tiêu thụ' của may-lanh vô nghĩa.
    """
    if not raw_energy_tech:
        return False
    return "inverter" in fold(raw_energy_tech)
