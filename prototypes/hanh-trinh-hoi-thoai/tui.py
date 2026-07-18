"""Lớp tương tác dòng lệnh cho mẫu hành trình hội thoại."""

from __future__ import annotations

import sys

from logic import FIELD_LABELS, apply_action, available_scenarios, new_state


BOLD = "\033[1m" if sys.stdout.isatty() else ""
DIM = "\033[2m" if sys.stdout.isatty() else ""
RESET = "\033[0m" if sys.stdout.isatty() else ""

STATUS_LABELS = {
    "known": "đã biết",
    "missing": "còn thiếu",
    "unknown": "chưa biết",
    "conflict": "mâu thuẫn",
}


def clear_screen() -> None:
    if sys.stdout.isatty():
        print("\033[2J\033[H", end="")


def heading(text: str) -> str:
    return f"{BOLD}{text}{RESET}"


def choose_scenario() -> str | None:
    scenarios = available_scenarios()
    while True:
        clear_screen()
        print(heading("MẪU THỬ HÀNH TRÌNH HỘI THOẠI"))
        print(f"{DIM}Không dùng trong sản phẩm. Mọi dữ liệu chỉ sống trong bộ nhớ.{RESET}\n")
        for index, scenario in enumerate(scenarios, start=1):
            print(f"[{index}] {scenario['title']}")
            print(f"    {DIM}{scenario['opening']}{RESET}")
        print("\n[q] Thoát")
        raw = input("\nChọn tình huống: ").strip().lower()
        if raw == "q":
            return None
        if raw.isdigit() and 1 <= int(raw) <= len(scenarios):
            return scenarios[int(raw) - 1]["id"]


def render(state: dict) -> None:
    clear_screen()
    print(heading("MẪU THỬ HÀNH TRÌNH HỘI THOẠI"))
    print(f"{DIM}Tình huống: {state['scenario_title']}{RESET}")
    print(f"Khách hàng: “{state['opening']}”")
    print(f"{heading('Giai đoạn')}: {state['phase']} | Đã hỏi: {state['question_count']}/3")

    print(f"\n{heading('Quan sát và trạng thái dữ kiện')}")
    for field in [
        "space_type",
        "area_m2",
        "budget_scope",
        "load_profile",
        "primary_priority",
        "installation_constraint",
    ]:
        item = state["field_states"][field]
        print(f"• {FIELD_LABELS[field]}: {STATUS_LABELS[item['status']]} | {item['display']}")

    if state["event_log"]:
        print(f"\n{heading('Sự kiện gần nhất')}: {state['event_log'][-1]}")
    if state["superseded_observations"]:
        print(heading("Dữ kiện đã được thay thế, không còn ảnh hưởng"))
        for item in state["superseded_observations"][-2:]:
            print(f"• {item['display']}")

    print(f"\n{heading('Giả thuyết')}")
    if state["hypotheses"]:
        for item in state["hypotheses"]:
            print(f"• {item['status']}: {item['statement']}")
            print(f"  {DIM}Quyền: {item['impact']} | Thay thế: {item['alternative']}{RESET}")
    else:
        print(f"• {DIM}Chưa tạo giả thuyết hành vi từ các dữ kiện hiện có.{RESET}")

    question = state.get("current_question")
    if question:
        print(f"\n{heading('Câu hỏi được chọn')}")
        print(question["text"])
        print(f"{DIM}Điểm: {question['score']} | {question['rationale']}{RESET}")
        for index, choice in enumerate(question["choices"], start=1):
            print(f"[{index}] {choice['label']}")
        print("[f] Không muốn trả lời")
    else:
        result = state["result"]
        print(f"\n{heading('Kết quả ở cuối hành trình')}")
        print(result["message"])
        if result["summary"]:
            print(f"\n{heading('Nhu cầu đã xác nhận')}")
            for item in result["summary"]:
                print(f"• {item}")
        if result["unconfirmed_hypotheses"]:
            print(f"\n{heading('Không được dùng để xếp hạng')}")
            for item in result["unconfirmed_hypotheses"]:
                print(f"• {item}")
        print(f"\n{heading('Giới hạn phải nói rõ')}")
        for item in result["limitations"]:
            print(f"• {item}")

    print(f"\n{heading('Điều khiển')}")
    controls = "[u] Quay lại hoặc sửa phản hồi gần nhất  [x] Xem kết quả ngay  [r] Chọn lại tình huống  [q] Thoát"
    print(controls)


def run() -> None:
    scenario_id = choose_scenario()
    if scenario_id is None:
        return
    state = new_state(scenario_id)

    while True:
        render(state)
        raw = input("\nHành động: ").strip().lower()
        if raw == "q":
            return
        if raw == "r":
            scenario_id = choose_scenario()
            if scenario_id is None:
                return
            state = new_state(scenario_id)
            continue
        if raw == "u":
            state = apply_action(state, {"type": "undo_last"})
            continue
        if raw == "x":
            state = apply_action(state, {"type": "show_result"})
            continue
        if raw == "f":
            state = apply_action(state, {"type": "refuse"})
            continue
        question = state.get("current_question")
        if question and raw.isdigit():
            choice_index = int(raw) - 1
            state = apply_action(state, {"type": "answer", "choice_index": choice_index})


if __name__ == "__main__":
    run()
