// Lõi phân loại thông tin (triage) — tách CHẮC CHẮN / DỰ ĐOÁN / THIẾU / MÂU THUẪN
// và chọn ĐÚNG MỘT câu hỏi có tác động lớn nhất. Thuần hàm, tất định.

import { describe, expect, it } from "vitest";
import { triage } from "./triage";

const factOf = (r: ReturnType<typeof triage>, slot: string) =>
  r.facts.find((f) => f.slot === slot);

describe("điều khách đã nói CHẮC CHẮN — kèm trích dẫn", () => {
  it("trích đủ ngành, diện tích, ngân sách, ưu tiên từ câu đầy đủ", () => {
    const r = triage("máy lạnh cho phòng ngủ 18m², ngân sách 15 triệu, ít ồn");
    expect(factOf(r, "nganh_hang")?.value).toBe("may_lanh");
    expect(factOf(r, "dien_tich_m2")?.value).toBe(18);
    expect(factOf(r, "ngan_sach")?.value).toBe(15_000_000);
    expect(factOf(r, "uu_tien")?.value).toContain("quiet");
    expect(r.conflicts).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.nextQuestion).toBeNull(); // đủ để quyết định — không hỏi thêm
  });

  it("trích dẫn cắt ĐÚNG NGUYÊN VĂN từ lời khách (giữ cả dấu)", () => {
    const r = triage("máy lạnh cho phòng ngủ 18m², ngân sách 15 triệu");
    expect(factOf(r, "dien_tich_m2")?.quote).toBe("18m²");
    expect(factOf(r, "ngan_hang")).toBeUndefined(); // slot sai tên không tồn tại
    expect(factOf(r, "nganh_hang")?.quote).toBe("máy lạnh");
  });

  it("khách bấm chip ngành trên giao diện → ngành là chắc chắn", () => {
    const r = triage("phòng 18m2 tầm 10 triệu", {}, { hintCategory: "may_lanh" });
    expect(factOf(r, "nganh_hang")?.value).toBe("may_lanh");
    expect(r.nextQuestion).toBeNull();
  });
});

describe("điều hệ thống đang DỰ ĐOÁN — không bao giờ thành chắc chắn", () => {
  it("mô hình đoán ngân sách không có trong lời khách → nằm ở dự đoán, không ở facts", () => {
    const r = triage("máy lạnh phòng 18m2", { budgetVnd: 20_000_000 });
    expect(factOf(r, "ngan_sach")).toBeUndefined();
    const p = r.predictions.find((x) => x.slot === "ngan_sach");
    expect(p?.value).toBe(20_000_000);
    expect(p?.note).toContain("không");
  });

  it("số mô hình đoán TRÙNG lời khách → là fact, không lặp lại ở dự đoán", () => {
    const r = triage("máy lạnh phòng 18m2 tầm 15 triệu", {
      fitValue: 18,
      budgetVnd: 15_000_000,
    });
    expect(r.predictions).toEqual([]);
  });

  it("suy luận thêm của mô hình được giữ nguyên làm dự đoán có nhãn", () => {
    const r = triage("máy lạnh 18m2 10 triệu", {
      assumptions: ["chắc là phòng ngủ vì khách nhắc trẻ con"],
    });
    expect(r.predictions.some((p) => p.slot === "suy_luan")).toBe(true);
  });
});

describe("điều còn THIẾU", () => {
  it("chỉ nói ngành → thiếu diện tích và ngân sách", () => {
    const r = triage("em cần mua máy lạnh");
    expect(r.missing).toContain("dien_tich_m2");
    expect(r.missing).toContain("ngan_sach");
  });

  it("ngành không có tiêu chí hoàn cảnh (laptop) → không đòi diện tích", () => {
    const r = triage("laptop tầm 20 triệu");
    expect(r.missing).toEqual([]);
    expect(r.nextQuestion).toBeNull();
  });
});

describe("điều MÂU THUẪN — khách nói hai giá trị khác nhau", () => {
  it("hai diện tích khác nhau → mâu thuẫn kèm cả hai trích dẫn, không tự chọn", () => {
    const r = triage("máy lạnh phòng 18m2 dưới 15 triệu... à nhầm, phòng 25m2");
    const c = r.conflicts.find((x) => x.slot === "dien_tich_m2");
    expect(c?.values).toEqual([18, 25]);
    expect(c?.quotes).toHaveLength(2);
    expect(factOf(r, "dien_tich_m2")).toBeUndefined(); // không thăng cấp phía nào
  });

  it("hai mức ngân sách khác nhau → mâu thuẫn ngân sách", () => {
    const r = triage("máy lạnh 18m2 khoảng 10 triệu, mà thôi lấy tầm 15 triệu cũng được");
    const c = r.conflicts.find((x) => x.slot === "ngan_sach");
    expect(c?.values).toEqual([10_000_000, 15_000_000]);
  });

  it("nhắc hai ngành khác nhau → mâu thuẫn ngành", () => {
    const r = triage("tư vấn máy lạnh, à mà tủ lạnh trước đi");
    const c = r.conflicts.find((x) => x.slot === "nganh_hang");
    expect(c?.values).toEqual(expect.arrayContaining(["may_lanh", "tu_lanh"]));
  });

  it("cùng một giá trị nhắc hai lần KHÔNG phải mâu thuẫn", () => {
    const r = triage("máy lạnh 18m2 nhé, đúng rồi phòng 18m2");
    expect(r.conflicts).toEqual([]);
    expect(factOf(r, "dien_tich_m2")?.value).toBe(18);
  });
});

describe("chọn ĐÚNG MỘT câu hỏi tác động lớn nhất", () => {
  it("mâu thuẫn thắng mọi khoảng trống: hỏi chốt diện tích trước dù thiếu ngân sách", () => {
    const r = triage("máy lạnh phòng 18m2... à nhầm 25m2");
    expect(r.missing).toContain("ngan_sach");
    expect(r.nextQuestion?.targetGap).toBe("mâu thuẫn: dien_tich_m2");
    expect(r.nextQuestion?.question).toContain("18");
    expect(r.nextQuestion?.question).toContain("25");
  });

  it("mâu thuẫn ngành xếp trên mâu thuẫn ngân sách", () => {
    const r = triage("máy lạnh hay tủ lạnh nhỉ, tầm 10 triệu hoặc 15 triệu");
    expect(r.nextQuestion?.targetGap).toBe("mâu thuẫn: nganh_hang");
  });

  it("không mâu thuẫn: thiếu ngành → hỏi ngành trước tiên", () => {
    const r = triage("chào em, tư vấn giúp anh");
    expect(r.nextQuestion?.targetGap).toContain("ngành");
  });

  it("có ngành, thiếu diện tích → hỏi diện tích (câu của config ngành)", () => {
    const r = triage("em cần máy lạnh");
    expect(r.nextQuestion?.question).toContain("m²");
  });

  it("chỉ còn thiếu ngân sách → hỏi ngân sách", () => {
    const r = triage("máy lạnh phòng 18m2");
    expect(r.nextQuestion?.targetGap).toBe("ngân sách tối đa");
  });

  it("mỗi lượt chỉ MỘT câu — kể cả khi vừa mâu thuẫn vừa thiếu nhiều slot", () => {
    const r = triage("máy lạnh hay tủ lạnh nhỉ");
    expect(r.nextQuestion).not.toBeNull(); // một câu duy nhất, không phải danh sách
  });
});

describe("tất định", () => {
  it("cùng hội thoại + cùng candidate → cùng báo cáo từng trường", () => {
    const text = "máy lạnh 18m2... à 25m2, tầm 15 triệu, ít ồn";
    const candidate = { budgetVnd: 99_000_000, assumptions: ["phòng ngủ?"] };
    expect(triage(text, candidate)).toEqual(triage(text, candidate));
  });
});
