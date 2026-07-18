"""Mẫu thử lô-gic, không dùng trong sản phẩm.

Câu hỏi cần trả lời: một hành trình tư vấn có thể biến lời nói ban đầu
thành quan sát, giả thuyết, câu hỏi kiểm chứng và kết quả có giới hạn
mà không gắn nhãn tâm lý hoặc hỏi lan man hay không?
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


MAX_QUESTIONS = 3


SCENARIOS: dict[str, dict[str, Any]] = {
    "bedroom_quiet": {
        "title": "Phòng ngủ, ưu tiên độ êm",
        "opening": "Phòng ngủ 20 mét vuông, ưu tiên máy êm vì có trẻ nhỏ.",
        "observations": [
            {
                "field": "space_type",
                "value": "phòng ngủ",
                "display": "Không gian: phòng ngủ",
            },
            {
                "field": "area_m2",
                "value": 20,
                "display": "Diện tích: 20 mét vuông",
            },
            {
                "field": "primary_priority",
                "value": "độ êm",
                "display": "Ưu tiên được nói trực tiếp: độ êm",
            },
            {
                "field": "user_context",
                "value": "có trẻ nhỏ",
                "display": "Ngữ cảnh được nói trực tiếp: có trẻ nhỏ",
            },
        ],
        "seed_hypotheses": [
            {
                "id": "quiet_driver",
                "dimension": "yếu tố quyết định",
                "statement": "Độ êm có khả năng làm đổi thứ hạng sản phẩm.",
                "status": "đã xác nhận trực tiếp",
                "impact": "xếp hạng trong phiên",
                "evidence": "Khách hàng nói rõ ưu tiên máy êm.",
                "alternative": "Không cần cách giải thích thay thế vì đây là ưu tiên trực tiếp.",
            }
        ],
    },
    "energy_vague": {
        "title": "Hỏi về tiết kiệm nhưng thiếu hoàn cảnh",
        "opening": "Mình đang xem máy lạnh dùng bộ biến tần (Inverter), loại nào tiết kiệm?",
        "observations": [
            {
                "field": "mentioned_topic",
                "value": "tiết kiệm điện",
                "display": "Chủ đề được hỏi: tiết kiệm điện",
            }
        ],
        "seed_hypotheses": [
            {
                "id": "running_cost_driver",
                "dimension": "yếu tố quyết định",
                "statement": "Chi phí vận hành có thể là yếu tố quyết định.",
                "status": "cần kiểm chứng",
                "impact": "chỉ chọn câu hỏi",
                "evidence": "Khách hàng hỏi loại nào tiết kiệm.",
                "alternative": "Khách hàng có thể chỉ đang muốn hiểu thuật ngữ bộ biến tần.",
                "confirm_field": "primary_priority",
                "confirm_value": "chi phí vận hành",
            }
        ],
    },
    "area_conflict": {
        "title": "Diện tích được nói không nhất quán",
        "opening": "Phòng khách khoảng 20 mét vuông, nhưng tính cả bếp chắc gần 30 mét vuông.",
        "observations": [
            {
                "field": "space_type",
                "value": "phòng khách liền bếp",
                "display": "Không gian: phòng khách liền bếp",
            },
            {
                "field": "area_m2",
                "value": 20,
                "display": "Diện tích được nêu lần một: 20 mét vuông",
            },
            {
                "field": "area_m2",
                "value": 30,
                "display": "Diện tích được nêu lần hai: gần 30 mét vuông",
            },
        ],
        "seed_hypotheses": [],
    },
}


QUESTIONS: dict[str, dict[str, Any]] = {
    "resolve_area": {
        "text": "Để tránh chọn sai điều kiện làm mát, diện tích cần tính là 20 hay gần 30 mét vuông?",
        "targets": ["area_m2"],
        "base_score": 100,
        "rationale": "Mâu thuẫn này có thể làm sai điều kiện kỹ thuật, nên phải giải quyết trước.",
        "only_when": "conflict",
        "choices": [
            {
                "label": "Chỉ tính phần phòng khách, 20 mét vuông",
                "updates": [
                    {
                        "field": "area_m2",
                        "value": 20,
                        "display": "Diện tích được xác nhận lại: 20 mét vuông",
                        "resolves": True,
                    }
                ],
            },
            {
                "label": "Tính cả không gian liền bếp, gần 30 mét vuông",
                "updates": [
                    {
                        "field": "area_m2",
                        "value": 30,
                        "display": "Diện tích được xác nhận lại: gần 30 mét vuông",
                        "resolves": True,
                    }
                ],
            },
            {
                "label": "Chưa đo chắc, giữ trạng thái chưa biết",
                "updates": [
                    {
                        "field": "area_m2",
                        "value": None,
                        "display": "Diện tích chưa được xác nhận",
                        "status": "unknown",
                        "resolves": True,
                    }
                ],
            },
        ],
    },
    "space_profile": {
        "text": "Máy sẽ dùng cho không gian nào và diện tích khoảng bao nhiêu?",
        "targets": ["space_type", "area_m2"],
        "base_score": 90,
        "rationale": "Thiếu không gian hoặc diện tích có thể làm sai tập sản phẩm phù hợp.",
        "only_when": "missing",
        "choices": [
            {
                "label": "Phòng ngủ khoảng 15 mét vuông",
                "updates": [
                    {"field": "space_type", "value": "phòng ngủ", "display": "Không gian: phòng ngủ"},
                    {"field": "area_m2", "value": 15, "display": "Diện tích: 15 mét vuông"},
                ],
            },
            {
                "label": "Phòng khách khoảng 25 mét vuông",
                "updates": [
                    {"field": "space_type", "value": "phòng khách", "display": "Không gian: phòng khách"},
                    {"field": "area_m2", "value": 25, "display": "Diện tích: 25 mét vuông"},
                ],
            },
            {
                "label": "Cửa hàng khoảng 35 mét vuông, thường có nhiều người",
                "updates": [
                    {"field": "space_type", "value": "cửa hàng", "display": "Không gian: cửa hàng"},
                    {"field": "area_m2", "value": 35, "display": "Diện tích: 35 mét vuông"},
                    {
                        "field": "occupancy",
                        "value": "nhiều người",
                        "display": "Tải sử dụng: thường có nhiều người",
                    },
                ],
            },
            {
                "label": "Chưa đo được diện tích",
                "updates": [
                    {
                        "field": "area_m2",
                        "value": None,
                        "display": "Diện tích chưa được xác nhận",
                        "status": "unknown",
                        "resolves": True,
                    }
                ],
            },
        ],
    },
    "budget_scope": {
        "text": "Khoảng ngân sách anh chị muốn giữ là bao nhiêu, đã gồm chi phí lắp đặt chưa?",
        "targets": ["budget_scope"],
        "base_score": 10,
        "rationale": "Ngân sách có thể thay đổi mạnh tập sản phẩm hợp lệ và cần tách giá máy với chi phí lắp.",
        "only_when": "missing",
        "choices": [
            {
                "label": "Dưới 10 triệu đồng, đã gồm lắp đặt",
                "updates": [
                    {
                        "field": "budget_scope",
                        "value": "dưới 10 triệu đồng, gồm lắp đặt",
                        "display": "Ngân sách tối đa: 10 triệu đồng, gồm lắp đặt",
                    }
                ],
            },
            {
                "label": "Từ 10 đến 15 triệu đồng, đã gồm lắp đặt",
                "updates": [
                    {
                        "field": "budget_scope",
                        "value": "10 đến 15 triệu đồng, gồm lắp đặt",
                        "display": "Ngân sách: 10 đến 15 triệu đồng, gồm lắp đặt",
                    }
                ],
            },
            {
                "label": "Ngân sách linh hoạt, ưu tiên phù hợp trước",
                "updates": [
                    {
                        "field": "budget_scope",
                        "value": "linh hoạt",
                        "display": "Ngân sách linh hoạt, không phải ràng buộc cứng",
                    }
                ],
            },
            {
                "label": "Chưa chốt ngân sách",
                "updates": [
                    {
                        "field": "budget_scope",
                        "value": None,
                        "display": "Ngân sách chưa được xác nhận",
                        "status": "unknown",
                    }
                ],
            },
        ],
    },
    "load_conditions": {
        "text": "Phòng có nắng trực tiếp, trần cao, nhiều người hoặc thường xuyên mở cửa không?",
        "targets": ["load_profile"],
        "base_score": 9,
        "rationale": "Điều kiện tải có thể làm đổi nhu cầu công suất và tính phù hợp kỹ thuật.",
        "only_when": "missing",
        "choices": [
            {
                "label": "Phòng ít nắng, trần bình thường, ít người",
                "updates": [
                    {
                        "field": "load_profile",
                        "value": "tải thông thường",
                        "display": "Điều kiện tải: ít nắng, trần bình thường, ít người",
                    }
                ],
            },
            {
                "label": "Có nắng trực tiếp vào buổi chiều",
                "updates": [
                    {
                        "field": "load_profile",
                        "value": "nắng trực tiếp",
                        "display": "Điều kiện tải: có nắng trực tiếp",
                    }
                ],
            },
            {
                "label": "Nhiều người hoặc thường xuyên mở cửa",
                "updates": [
                    {
                        "field": "load_profile",
                        "value": "tải biến động cao",
                        "display": "Điều kiện tải: nhiều người hoặc thường xuyên mở cửa",
                    }
                ],
            },
            {
                "label": "Chưa rõ các điều kiện này",
                "updates": [
                    {
                        "field": "load_profile",
                        "value": None,
                        "display": "Điều kiện tải chưa được xác nhận",
                        "status": "unknown",
                    }
                ],
            },
        ],
    },
    "primary_tradeoff": {
        "text": "Nếu phải đánh đổi, anh chị muốn ưu tiên giá mua, tiền điện, độ êm hay sự cân bằng?",
        "targets": ["primary_priority"],
        "base_score": 7,
        "rationale": "Ưu tiên được xác nhận có thể đổi thứ hạng nhưng không được tự loại sản phẩm.",
        "only_when": "missing",
        "choices": [
            {
                "label": "Ưu tiên giá mua ban đầu",
                "updates": [
                    {
                        "field": "primary_priority",
                        "value": "giá mua ban đầu",
                        "display": "Ưu tiên được xác nhận: giá mua ban đầu",
                    }
                ],
            },
            {
                "label": "Ưu tiên chi phí vận hành",
                "updates": [
                    {
                        "field": "primary_priority",
                        "value": "chi phí vận hành",
                        "display": "Ưu tiên được xác nhận: chi phí vận hành",
                    }
                ],
            },
            {
                "label": "Ưu tiên độ êm",
                "updates": [
                    {
                        "field": "primary_priority",
                        "value": "độ êm",
                        "display": "Ưu tiên được xác nhận: độ êm",
                    }
                ],
            },
            {
                "label": "Muốn cân bằng, chưa có tiêu chí trội",
                "updates": [
                    {
                        "field": "primary_priority",
                        "value": "cân bằng",
                        "display": "Ưu tiên được xác nhận: cân bằng các tiêu chí",
                    }
                ],
            },
        ],
    },
    "installation": {
        "text": "Vị trí lắp, nguồn điện hoặc thời hạn lắp có điều kiện nào bắt buộc không?",
        "targets": ["installation_constraint"],
        "base_score": 6,
        "rationale": "Điều kiện lắp đặt có thể loại sản phẩm dù điểm ưu tiên mềm cao.",
        "only_when": "missing",
        "choices": [
            {
                "label": "Không có hạn chế đặc biệt đã biết",
                "updates": [
                    {
                        "field": "installation_constraint",
                        "value": "không có hạn chế đã biết",
                        "display": "Lắp đặt: chưa có hạn chế đặc biệt đã biết",
                    }
                ],
            },
            {
                "label": "Không gian lắp dàn nóng bị hạn chế",
                "updates": [
                    {
                        "field": "installation_constraint",
                        "value": "hạn chế vị trí dàn nóng",
                        "display": "Ràng buộc lắp đặt: vị trí dàn nóng hạn chế",
                    }
                ],
            },
            {
                "label": "Cần lắp trong thời gian ngắn",
                "updates": [
                    {
                        "field": "installation_constraint",
                        "value": "thời hạn ngắn",
                        "display": "Ràng buộc lắp đặt: cần lắp sớm",
                    }
                ],
            },
            {
                "label": "Chưa khảo sát vị trí lắp",
                "updates": [
                    {
                        "field": "installation_constraint",
                        "value": None,
                        "display": "Điều kiện lắp đặt chưa được xác nhận",
                        "status": "unknown",
                    }
                ],
            },
        ],
    },
}


FIELD_LABELS = {
    "space_type": "loại không gian",
    "area_m2": "diện tích",
    "budget_scope": "ngân sách",
    "load_profile": "điều kiện tải",
    "primary_priority": "ưu tiên chính",
    "installation_constraint": "điều kiện lắp đặt",
}


MATERIAL_FIELDS = [
    "space_type",
    "area_m2",
    "budget_scope",
    "load_profile",
    "primary_priority",
    "installation_constraint",
]


HARD_RESULT_FIELDS = ["space_type", "area_m2"]


def available_scenarios() -> list[dict[str, str]]:
    """Trả danh sách tình huống mà không làm lộ cấu trúc nội bộ."""
    return [
        {"id": scenario_id, "title": data["title"], "opening": data["opening"]}
        for scenario_id, data in SCENARIOS.items()
    ]


def new_state(scenario_id: str) -> dict[str, Any]:
    """Tạo trạng thái đầu tiên cho một tình huống."""
    if scenario_id not in SCENARIOS:
        raise ValueError(f"Tình huống không tồn tại: {scenario_id}")
    return _derive_state(scenario_id, [])


def apply_action(state: dict[str, Any], action: dict[str, Any]) -> dict[str, Any]:
    """Bộ giảm thuần: trạng thái và hành động tạo ra trạng thái mới."""
    actions = deepcopy(state["actions"])
    action_type = action.get("type")

    if action_type == "undo_last":
        retracted_indexes = {
            item["target_index"] for item in actions if item["type"] == "retract"
        }
        for index in range(len(actions) - 1, -1, -1):
            if actions[index]["type"] in {"answer", "refuse", "show_result"} and index not in retracted_indexes:
                actions.append({"type": "retract", "target_index": index})
                break
        return _derive_state(state["scenario_id"], actions)

    if action_type == "answer":
        question = state.get("current_question")
        if not question:
            return state
        choice_index = action.get("choice_index")
        if not isinstance(choice_index, int) or not 0 <= choice_index < len(question["choices"]):
            return state
        actions.append(
            {
                "type": "answer",
                "question_id": question["id"],
                "choice_index": choice_index,
            }
        )
        return _derive_state(state["scenario_id"], actions)

    if action_type == "refuse":
        question = state.get("current_question")
        if not question:
            return state
        actions.append({"type": "refuse", "question_id": question["id"]})
        return _derive_state(state["scenario_id"], actions)

    if action_type == "show_result":
        actions.append({"type": "show_result"})
        return _derive_state(state["scenario_id"], actions)

    return state


def _derive_state(scenario_id: str, actions: list[dict[str, Any]]) -> dict[str, Any]:
    scenario = SCENARIOS[scenario_id]
    observations = []
    for source_observation in scenario["observations"]:
        observation = deepcopy(source_observation)
        observation.setdefault("status", "observed")
        observation.setdefault("resolves", False)
        observation["source"] = "lời mở đầu"
        observations.append(observation)

    asked_questions: list[str] = []
    refused_fields: set[str] = set()
    force_result = False
    event_log: list[str] = []
    retracted_indexes = {
        item["target_index"] for item in actions if item["type"] == "retract"
    }

    for index, action in enumerate(actions):
        action_type = action["type"]
        if action_type == "retract":
            event_log.append("Hành động trước được đánh dấu đã thay thế; lịch sử vẫn được giữ.")
            continue
        is_retracted = index in retracted_indexes
        if action_type == "show_result":
            if not is_retracted:
                force_result = True
                event_log.append("Khách hàng yêu cầu xem kết quả ngay.")
            continue

        question_id = action["question_id"]
        question = QUESTIONS[question_id]
        if is_retracted:
            if action_type == "answer":
                choice = question["choices"][action["choice_index"]]
                for source_update in choice["updates"]:
                    update = deepcopy(source_update)
                    update["status"] = "superseded"
                    update.setdefault("resolves", False)
                    update["source"] = f"phản hồi cũ cho {question_id}"
                    observations.append(update)
            continue

        asked_questions.append(question_id)

        if action_type == "refuse":
            refused_fields.update(question["targets"])
            refused_labels = [FIELD_LABELS[target] for target in question["targets"]]
            event_log.append(f"Khách hàng từ chối trả lời về {', '.join(refused_labels)}.")
            continue

        choice = question["choices"][action["choice_index"]]
        event_log.append(f"Trả lời: {choice['label']}.")
        for source_update in choice["updates"]:
            update = deepcopy(source_update)
            update.setdefault("status", "observed")
            update.setdefault("resolves", False)
            update["source"] = f"trả lời cho {question_id}"
            observations.append(update)

    field_states = {
        field: _field_state(observations, field) for field in MATERIAL_FIELDS
    }
    hypotheses = _derive_hypotheses(scenario, field_states)
    question_count = len(asked_questions)

    current_question = None
    if not force_result and question_count < MAX_QUESTIONS:
        current_question = _select_question(
            field_states=field_states,
            asked_questions=asked_questions,
            refused_fields=refused_fields,
        )

    result = None
    if force_result or current_question is None:
        result = _build_result(field_states, hypotheses, refused_fields)

    phase = _derive_phase(
        question_count=question_count,
        current_question=current_question,
        result=result,
    )

    gaps = [
        {
            "field": field,
            "label": FIELD_LABELS[field],
            "status": field_states[field]["status"],
            "refused": field in refused_fields,
        }
        for field in MATERIAL_FIELDS
        if field_states[field]["status"] != "known"
    ]

    return {
        "scenario_id": scenario_id,
        "scenario_title": scenario["title"],
        "opening": scenario["opening"],
        "phase": phase,
        "observations": observations,
        "superseded_observations": [
            item for item in observations if item.get("status") == "superseded"
        ],
        "field_states": field_states,
        "hypotheses": hypotheses,
        "gaps": gaps,
        "asked_questions": asked_questions,
        "question_count": question_count,
        "current_question": current_question,
        "result": result,
        "event_log": event_log,
        "actions": deepcopy(actions),
        "guardrails": [
            "Không suy động cơ sâu từ ngữ cảnh trẻ nhỏ hoặc một từ khóa.",
            "Giả thuyết chưa xác nhận chỉ được chọn câu hỏi.",
            "Không hỏi lại trường đã bị từ chối trong phiên.",
        ],
    }


def _field_state(observations: list[dict[str, Any]], field: str) -> dict[str, Any]:
    matching = [
        item
        for item in observations
        if item["field"] == field and item.get("status") != "superseded"
    ]
    if not matching:
        return {"status": "missing", "value": None, "display": "chưa có"}

    resolutions = [
        item
        for item in matching
        if item.get("resolves") and item.get("status") != "superseded"
    ]
    if resolutions:
        latest = resolutions[-1]
        if latest.get("status") == "unknown" or latest.get("value") is None:
            return {"status": "unknown", "value": None, "display": latest["display"]}
        return {"status": "known", "value": latest["value"], "display": latest["display"]}

    observed = [
        item for item in matching if item.get("status") == "observed" and item.get("value") is not None
    ]
    unique_values = []
    for item in observed:
        if item["value"] not in unique_values:
            unique_values.append(item["value"])

    if len(unique_values) > 1:
        return {
            "status": "conflict",
            "value": unique_values,
            "display": "mâu thuẫn: " + " và ".join(str(value) for value in unique_values),
        }
    if len(unique_values) == 1:
        latest = observed[-1]
        return {"status": "known", "value": latest["value"], "display": latest["display"]}
    return {"status": "unknown", "value": None, "display": matching[-1]["display"]}


def _derive_hypotheses(
    scenario: dict[str, Any], field_states: dict[str, dict[str, Any]]
) -> list[dict[str, str]]:
    hypotheses = deepcopy(scenario["seed_hypotheses"])
    priority_state = field_states["primary_priority"]

    for hypothesis in hypotheses:
        confirm_field = hypothesis.get("confirm_field")
        confirm_value = hypothesis.get("confirm_value")
        if (
            confirm_field
            and field_states[confirm_field]["status"] == "known"
            and field_states[confirm_field]["value"] == confirm_value
        ):
            hypothesis["status"] = "đã xác nhận trực tiếp"
            hypothesis["impact"] = "xếp hạng trong phiên"
            hypothesis["evidence"] = "Khách hàng xác nhận lại ưu tiên trong câu hỏi đánh đổi."

    known_ids = {hypothesis["id"] for hypothesis in hypotheses}
    if priority_state["status"] == "known" and "quiet_driver" not in known_ids:
        hypotheses.append(
            {
                "id": "confirmed_priority",
                "dimension": "yếu tố quyết định",
                "statement": f"{priority_state['value']} được xác nhận là ưu tiên trong phiên.",
                "status": "đã xác nhận trực tiếp",
                "impact": "xếp hạng trong phiên",
                "evidence": "Câu trả lời trực tiếp cho câu hỏi đánh đổi.",
                "alternative": "Không cần suy ra đặc điểm bền vững ngoài phiên.",
            }
        )

    return hypotheses


def _select_question(
    field_states: dict[str, dict[str, Any]],
    asked_questions: list[str],
    refused_fields: set[str],
) -> dict[str, Any] | None:
    candidates: list[dict[str, Any]] = []

    for question_id, question in QUESTIONS.items():
        if question_id in asked_questions:
            continue
        if any(target in refused_fields for target in question["targets"]):
            continue

        target_statuses = [field_states[target]["status"] for target in question["targets"]]
        condition = question["only_when"]
        eligible = False
        if condition == "conflict":
            eligible = any(status == "conflict" for status in target_statuses)
        elif condition == "missing":
            eligible = any(status in {"missing", "unknown"} for status in target_statuses)

        if not eligible:
            continue

        candidate = deepcopy(question)
        candidate["id"] = question_id
        candidate["score"] = question["base_score"]
        candidates.append(candidate)

    if not candidates:
        return None

    return max(candidates, key=lambda item: (item["score"], item["id"]))


def _derive_phase(
    question_count: int,
    current_question: dict[str, Any] | None,
    result: dict[str, Any] | None,
) -> str:
    if result:
        return "từ chối có phạm vi" if result["mode"] == "scoped_refusal" else "trình bày kết quả"
    if question_count == 0:
        return "khám phá"
    if current_question and current_question["score"] >= 90:
        return "giải quyết dữ kiện bắt buộc"
    if question_count < MAX_QUESTIONS - 1:
        return "kiểm chứng"
    return "xác minh trước khi trình bày"


def _build_result(
    field_states: dict[str, dict[str, Any]],
    hypotheses: list[dict[str, str]],
    refused_fields: set[str],
) -> dict[str, Any]:
    hard_blockers = [
        FIELD_LABELS[field]
        for field in HARD_RESULT_FIELDS
        if field_states[field]["status"] != "known"
    ]
    limitations: list[str] = []

    for field in MATERIAL_FIELDS:
        state = field_states[field]
        if state["status"] == "known":
            continue
        label = FIELD_LABELS[field]
        if field in refused_fields:
            limitations.append(f"Khách hàng không cung cấp {label}; không hỏi lại trong phiên.")
        elif state["status"] == "conflict":
            limitations.append(f"{label.capitalize()} còn mâu thuẫn, chưa được dùng làm dữ kiện.")
        else:
            limitations.append(f"Chưa xác nhận {label}; không điền giá trị mặc định.")

    limitations.append("Giá và tồn kho hiện hành phải được kiểm tra từ nguồn thương mại trước khi công bố.")
    confirmed_hypotheses = [
        item["statement"] for item in hypotheses if item["status"] == "đã xác nhận trực tiếp"
    ]
    unconfirmed_hypotheses = [
        item["statement"] for item in hypotheses if item["status"] != "đã xác nhận trực tiếp"
    ]

    summary = [
        state["display"]
        for field, state in field_states.items()
        if state["status"] == "known" and field in MATERIAL_FIELDS
    ]

    if hard_blockers:
        message = (
            "Tôi chưa thể xác nhận sản phẩm phù hợp vì còn thiếu hoặc mâu thuẫn về "
            + ", ".join(hard_blockers)
            + ". Tôi vẫn giữ các nhu cầu đã xác nhận để tiếp tục khi có dữ kiện."
        )
        mode = "scoped_refusal"
    else:
        message = (
            "Tôi đã đủ dữ kiện tối thiểu để chuyển sang tìm sản phẩm. "
            "Các ưu tiên chưa xác nhận sẽ không được dùng để xếp hạng."
        )
        mode = "ready"

    return {
        "mode": mode,
        "message": message,
        "summary": summary,
        "confirmed_hypotheses": confirmed_hypotheses,
        "unconfirmed_hypotheses": unconfirmed_hypotheses,
        "limitations": limitations,
        "hard_blockers": hard_blockers,
    }
