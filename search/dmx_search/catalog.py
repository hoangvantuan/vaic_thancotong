"""Nạp catalog thống nhất từ nguồn data mới: docs/dataset/catalog/catalog.jsonl.

Một file JSONL duy nhất, mỗi dòng một sản phẩm. Khác với nguồn cũ (14 file
JSON mỗi category một schema), giờ mọi sản phẩm chung một khung:

    {product_id, sku, model_code, name, brand,
     category: {id, name},
     price: {original, sale, currency},
     specs: {<cột spec riêng của category>: <giá trị thô>}, ...}

Vẫn dùng FacetSpec khai báo cột spec nào ánh xạ vào facet chuẩn nào. Cột spec
không khai báo vẫn nằm nguyên trong `raw["specs"]` để trace nguồn - không vứt.

Hai điểm khác nguồn cũ cần chú ý:
  1. Giá là object số ({original, sale}) - không còn phải parse chuỗi.
  2. Có sẵn cột `name` thật -> không phải tự dựng tên từ brand + spec nữa.
     Bản ghi name=null là sản phẩm chỉ có trong bảng spec kỹ thuật (không có
     thông tin bán hàng) -> LỌC BỎ, không phải khách hàng thấy được.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator

from .concepts import is_inverter, tag_to_concepts
from .normalize import (
    State,
    Value,
    fold,
    parse_area_range,
    parse_energy_label,
    parse_noise,
    parse_people_range,
    parse_tags,
    parse_volume_liters,
)

CATALOG_FILE = "catalog.jsonl"


@dataclass
class Product:
    product_id: str
    model_code: str
    sku: str
    category: str
    slug: str
    brand: str
    display_name: str
    facets: dict[str, Value]
    concepts: frozenset[str]
    inverter: bool
    raw: dict

    def price(self) -> Value:
        """Giá bán thực: ưu tiên giá khuyến mãi, lùi về giá gốc."""
        km = self.facets.get("price_sale")
        if km and km.ok:
            return km
        return self.facets.get("price_list", Value(State.MISSING))

    def has_price(self) -> bool:
        return self.price().ok


# Vài category cần slug ỔN ĐỊNH khác quy tắc tự sinh - vì `FACET_SPECS` và
# `_FIT_CRITICAL` (search.py) tham chiếu tới các slug này bằng tên cứng.
# Ngoài các entry dưới đây, MỌI category khác lấy slug tự sinh từ chính tên nó
# (_auto_slug) -> thêm ngành mới vào data là tự có slug, không phải khai báo tay.
_SLUG_OVERRIDES: dict[str, str] = {
    "quat cac loai": "quat",
    "may hut bui gia dinh": "may-hut-bui",
    "thiet bi loc nuoc": "thiet-bi-loc-nuoc",
    "loa, tai nghe": "loa-tai-nghe",
    "tu dong, tu mat": "tu-mat-tu-dong",
    "pc, may in": "may-tinh-de-ban",   # "Pc, máy in" mới là máy tính để bàn thương mại thật
}


def _auto_slug(f: str) -> str:
    """Tên category ĐÃ FOLD -> slug: bỏ dấu phẩy, gộp khoảng trắng, gạch nối."""
    return f.replace(",", " ").replace("  ", " ").strip().replace(" ", "-")


def category_to_slug(cat_name: str | None) -> str:
    """category.name thô -> slug ổn định, dùng chung cho cả load lẫn nhận diện."""
    if not cat_name:
        return "khac"
    f = fold(cat_name)
    return _SLUG_OVERRIDES.get(f, _auto_slug(f))


# Cột spec catalog -> (tên facet chuẩn, parser). Khai báo theo slug.
# Giá KHÔNG khai báo ở đây - nó là object số riêng, xử lý trong _price_facets().
FACET_SPECS: dict[str, dict[str, tuple[str, Callable]]] = {
    "may-lanh": {
        "Phạm vi sử dụng": ("area", parse_area_range),
        "Độ ồn": ("noise_db", parse_noise),
        "Nhãn năng lượng": ("energy", parse_energy_label),
        "Tiện ích": ("features", parse_tags),
    },
    "tu-lanh": {
        "Số người sử dụng": ("people", parse_people_range),
        "Dung tích tổng": ("volume_l", parse_volume_liters),
        "Tiện ích": ("features", parse_tags),
    },
    "may-giat": {
        "Số người sử dụng": ("people", parse_people_range),
        "Tiện ích": ("features", parse_tags),
    },
}
# Category chưa khai báo riêng vẫn dùng được với facet chung.
_DEFAULT_SPEC = {
    "Tiện ích": ("features", parse_tags),
}

# Alias VĂN NÓI thêm cho một số slug: từ khách hay dùng nhưng KHÁC tên category
# chính thức trong data. Tên chính thức của mọi category được tự thêm làm hint
# trong build_category_hints() nên KHÔNG cần liệt kê lại ở đây.
_HINT_ALIASES: dict[str, list[str]] = {
    "may-lanh": ["dieu hoa", "may dieu hoa", "aircon", "may ret"],
    "tu-lanh": ["tulanh", "fridge"],
    "may-giat": ["giat do", "washing"],
    "may-say-quan-ao": ["may say"],
    "may-rua-chen": ["rua bat", "rua chen"],
    "tu-mat-tu-dong": ["tu dong", "tu mat", "tu cap dong", "tu kem"],
    "may-nuoc-nong": ["binh nong lanh", "nuoc nong"],
    "may-tinh-bang": ["tablet", "ipad"],
    "may-tinh-de-ban": ["may tinh de ban", "pc", "may ban", "desktop", "may bo"],
    "tivi": ["tv", "ti vi", "smart tv"],
    "laptop": ["may tinh xach tay"],
    "dien-thoai": ["smartphone", "iphone", "dtdd"],
    "loa-tai-nghe": ["headphone", "earphone", "tai nghe", "loa"],
    "quat": ["quat may", "fan"],
    "noi-com-dien": ["noi com"],
    "thiet-bi-loc-nuoc": ["may loc nuoc", "loc nuoc"],
    "may-hut-bui": ["hut bui", "robot hut bui"],
    "dong-ho-thong-minh": ["smartwatch"],
    "may-in": ["printer", "may in"],
    "lo-vi-song": ["lo vi ba", "microwave"],
    "thiet-bi-khong-khi": ["may loc khong khi", "loc khong khi", "may hut am"],
}


def build_category_hints(products: list[Product]) -> dict[str, list[str]]:
    """Từ khoá nhận diện category TỰ SINH từ chính data + alias văn nói.

    Với mỗi category có SP trong catalog: dùng tên chính thức (đã fold) làm hint,
    cộng phần đầu trước dấu phẩy ('Loa, Tai nghe' -> cả 'loa, tai nghe' lẫn 'loa').
    Nhờ vậy THÊM ngành mới vào data là tự nhận diện được, không phải khai báo tay.

    `extract` sẽ dò hint DÀI trước (chống 'may lanh' khớp nhầm 'phu kien may lanh').
    """
    hints: dict[str, set[str]] = {}
    for p in products:
        if not p.category:
            continue
        f = fold(p.category)
        s = hints.setdefault(p.slug, set())
        s.add(f)
        head = f.split(",")[0].strip()   # phần chính trước dấu phẩy
        if head:
            s.add(head)
    for slug, extra in _HINT_ALIASES.items():
        hints.setdefault(slug, set()).update(fold(w) for w in extra)
    return {slug: sorted(ws, key=len, reverse=True) for slug, ws in hints.items()}


# CATEGORY_HINTS mặc định (rỗng cho tới khi build từ data). Giữ tên biến để
# tương thích code cũ; nên gọi build_category_hints(products) sau khi load.
CATEGORY_HINTS: dict[str, list[str]] = {}


def _price_facets(price: dict | None) -> dict[str, Value]:
    """Giá đã là object số {original, sale} -> facet price_list/price_sale.

    Không còn parse chuỗi. Vẫn qua Value để giữ chuẩn 3-trạng-thái: có giá /
    thiếu giá (MISSING) mà guardrail và search dựa vào. Không bịa số.
    """
    price = price or {}

    def mk(v) -> Value:
        if isinstance(v, (int, float)) and 100_000 <= v <= 500_000_000:
            return Value(State.OK, v, num=float(v))
        return Value(State.MISSING, v)

    return {
        "price_list": mk(price.get("original")),
        "price_sale": mk(price.get("sale")),
    }


def _iter_records(path: Path) -> Iterator[dict]:
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def _build_product(rec: dict) -> Product:
    slug = category_to_slug((rec.get("category") or {}).get("name"))
    specs = rec.get("specs") or {}
    spec_map = FACET_SPECS.get(slug, _DEFAULT_SPEC)

    facets: dict[str, Value] = _price_facets(rec.get("price"))
    for col, (name, parser) in spec_map.items():
        facets[name] = parser(specs.get(col))

    feat = facets.get("features")
    concepts: set[str] = set()
    if feat and feat.tags:
        for t in feat.tags:
            concepts.update(tag_to_concepts(t))

    inv = is_inverter(specs.get("Công nghệ tiết kiệm điện") or specs.get("Loại Inverter"))
    if inv:
        concepts.add("inverter")

    return Product(
        product_id=str(rec.get("product_id", "")),
        model_code=str(rec.get("model_code") or ""),
        sku=str(rec.get("sku") or ""),
        category=(rec.get("category") or {}).get("name") or "",
        slug=slug,
        brand=str(rec.get("brand") or "?"),
        display_name=str(rec.get("name") or "").strip(),
        facets=facets,
        concepts=frozenset(concepts),
        inverter=inv,
        raw=rec,
    )


def load_catalog(root: str | Path, slugs: list[str] | None = None) -> list[Product]:
    """Nạp catalog.jsonl. Lọc bản ghi name=null (chỉ là spec kỹ thuật, không bán).

    `root` trỏ tới thư mục chứa catalog.jsonl (docs/dataset/catalog).
    `slugs` (tuỳ chọn) chỉ nạp các category cần -> nhẹ RAM khi test.
    """
    root = Path(root)
    path = root / CATALOG_FILE if root.is_dir() else root

    out: list[Product] = []
    for rec in _iter_records(path):
        # name=null: sản phẩm chỉ tồn tại trong bảng spec kỹ thuật, không có
        # thông tin bán hàng -> khách không thấy được -> bỏ.
        if not rec.get("name"):
            continue
        p = _build_product(rec)
        if slugs and p.slug not in slugs:
            continue
        out.append(p)
    return out


def known_brands(products: list[Product]) -> set[str]:
    return {p.brand for p in products if p.brand and p.brand != "?"}


def dedupe(products: list[Product]) -> list[Product]:
    """Cùng sản phẩm nhưng nhiều biến thể (spec/giá khác) là biến thể THẬT -
    không gộp. Chỉ loại bản ghi trùng HOÀN TOÀN.

    Khoá dedupe ưu tiên product_id (id ổn định trong nguồn mới); model_code/sku
    thường null nên không đủ để phân biệt. Thêm giá + diện tích để giữ lại các
    biến thể công suất khác nhau của cùng một product_id.
    """
    seen: set[tuple] = set()
    out = []
    for p in products:
        pr = p.price()
        a = p.facets.get("area")
        k = (p.product_id or p.model_code or p.sku,
             pr.num if pr.ok else None,
             (a.lo, a.hi) if a and a.ok else None)
        if k in seen:
            continue
        seen.add(k)
        out.append(p)
    return out
