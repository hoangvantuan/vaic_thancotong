"""Tầng AGENT hỏi ngược - KHÔNG thuộc về search.

Ranh giới trách nhiệm của hệ thống:

    câu khách  ──extract──►  Need  ──[AGENT làm rõ]──►  Need đủ  ──search──►  Results

  - `extract`  : câu nói -> Need (chỉ trích, không phán xét đủ/thiếu).
  - `clarify`  : (module NÀY) soi Need -> có đủ TÍN HIỆU để search chưa.
                 Luật: có ÍT NHẤT 1 tiêu chí trong {category, ngân sách, hãng,
                 fit} là đủ để search - KHÔNG bắt buộc phải có category. Chỉ khi
                 Need rỗng hoàn toàn (câu chào hỏi, "bạn tìm đi"...) mới hỏi ngược.
  - `search`   : nhận Need đã có tín hiệu, đi tìm sản phẩm đúng nhất, tự loại sản
                 phẩm không sinh được lý do nào.

Tách hàm này ra khỏi `Need`/`extract.py` để cái ranh giới trên là hiển nhiên
trong code: `search` không bao giờ import `clarify`, và ngược lại.
"""

from __future__ import annotations

from .extract import Need


def signals(need: Need) -> list[str]:
    """Các TÍN HIỆU tìm kiếm mà khách đã cung cấp. Rỗng = chưa nói gì để tìm.

    Bốn tín hiệu đủ để search bám vào: ngành hàng, ngân sách, hãng, độ hợp
    (diện tích/số người). Có bất kỳ cái nào là search chạy được.
    """
    out: list[str] = []
    if need.category is not None:
        out.append("category")
    if need.budget_max is not None or need.budget_min is not None:
        out.append("budget")
    if need.brands:
        out.append("brand")
    if need.area_m2 is not None or need.people is not None:
        out.append("fit")
    return out


def is_ready(need: Need) -> bool:
    """Đủ để giao cho search chưa: chỉ cần CÓ ÍT NHẤT 1 tín hiệu."""
    return bool(signals(need))


def missing_required(need: Need) -> list[str]:
    """Điều kiện BẮT BUỘC còn thiếu -> agent phải hỏi cho bằng được.

    Giờ chỉ chặn khi Need RỖNG HOÀN TOÀN (0 tín hiệu): không có gì để tìm.
    Trả ["tiêu chí tìm kiếm"] làm dấu hiệu cần hỏi "anh/chị cần mua gì".
    """
    return [] if is_ready(need) else ["tiêu chí tìm kiếm"]


def recommended_to_ask(need: Need) -> list[str]:
    """Slot NÊN hỏi thêm để tư vấn sát hơn (khi đã có tín hiệu để search).

    - category: có tín hiệu khác nhưng chưa biết ngành -> nên hỏi để khỏi lẫn ngành.
    - Diện tích (máy lạnh) / số người (tủ lạnh, máy giặt): thiếu thì không chấm
      được độ hợp -> nên hỏi để đúng công suất/dung tích.
    - Ngân sách: thiếu thì không lọc được tầm giá -> nên hỏi.

    Rỗng khi Need chưa có tín hiệu nào (lúc đó hỏi tiêu chí trước, xem missing_required).
    """
    if not is_ready(need):
        return []
    out: list[str] = []
    if need.category is None:
        out.append("category")
    elif need.category == "may-lanh" and need.area_m2 is None:
        out.append("area_m2")
    elif need.category in ("tu-lanh", "may-giat") and need.people is None:
        out.append("people")
    if need.budget_max is None:
        out.append("budget_max")
    return out
