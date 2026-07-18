// Kiểm thử lệnh nạp catalog (#25) — hợp lệ · thiếu · mâu thuẫn · trùng · lỗi.
//
// Điểm neo quan trọng: MỌI nguồn chứng minh đi ra từ bước nạp phải qua được
// `validateProvenance` — cổng dùng chung cho các phiếu #25–#30.

import { describe, expect, it } from "vitest";
import {
  STATUS,
  classifyLine,
  detectDuplicates,
  displayIneligibilityReasons,
  isAircon,
  normalizeAirconRecord,
  parseAreaFromSpecs,
  parseAreaM2,
  parseCoolingCapacity,
  parseCrawledAt,
  parseEnergyStars,
  parseInverter,
  parseNoiseDb,
} from "../../scripts/ingest/catalog-ingest-lib.mjs";
import { validateProvenance, type Provenance } from "@/lib/core/contracts/provenance";

const SRC = "docs/dataset/catalog/catalog.jsonl";
const FALLBACK_AT = "2026-07-18T12:07:03+07:00";
const OPTS = { sourcePath: SRC, lineNo: 42, fallbackObservedAt: FALLBACK_AT };

/** Bản ghi máy lạnh hợp lệ, đủ điều kiện hiển thị — mô phỏng dữ liệu thật. */
const VALID = {
  product_id: "367357",
  sku: null,
  model_code: null,
  productcode: "1751098000323",
  name: "Máy lạnh LG Inverter 2.5 HP ZTNQ24GTLA1",
  brand: "LG",
  category: { id: 2002, name: "Máy lạnh" },
  price: { original: 36590000, sale: 30740000, currency: "VND" },
  url: "https://www.dienmayxanh.com/may-lanh/vi-du",
  crawled_at: "2026-07-17 11:40:50",
  specs: {
    "Phạm vi sử dụng": "Từ 30 - 40m² (từ 80 đến 120m³)",
    "Công suất làm lạnh": "2.5 HP - 24.000 BTU",
    "Nhãn năng lượng": "5 sao (Hiệu suất năng lượng 5.30)",
    "Độ ồn": "Dàn lạnh: 21 - 39 dB - Dàn nóng: 50 dB",
    "Loại Inverter": "Máy lạnh Inverter",
  },
};

describe("bản ghi hợp lệ", () => {
  const row = normalizeAirconRecord(VALID, OPTS);

  it("chuẩn hoá đúng các trường tư vấn, giữ nguyên giá trị gốc", () => {
    expect(row.displayEligible).toBe(true);
    expect(row.fields.priceObservedVnd.normalizedValue).toEqual({
      status: "observed",
      value: 30740000, // giá sale được ưu tiên — giá ĐÃ QUAN SÁT, không phải giá hiện tại
    });
    expect(row.fields.priceObservedVnd.rawValue).toContain("36590000"); // gốc còn nguyên
    expect(row.fields.roomAreaMinM2.normalizedValue).toEqual({ status: "observed", value: 30 });
    expect(row.fields.roomAreaMaxM2.normalizedValue).toEqual({ status: "observed", value: 40 });
    expect(row.fields.coolingCapacityBtu.normalizedValue).toEqual({ status: "observed", value: 24000 });
    expect(row.fields.coolingCapacityHp.normalizedValue).toEqual({ status: "observed", value: 2.5 });
    expect(row.fields.energyLabelStars.normalizedValue).toEqual({ status: "observed", value: 5 });
    expect(row.fields.noiseIndoorMinDb.normalizedValue).toEqual({ status: "observed", value: 21 });
    expect(row.fields.inverter.normalizedValue).toEqual({ status: "observed", value: "inverter" });
  });

  it("mọi nguồn chứng minh đều qua cổng validateProvenance dùng chung #25–#30", () => {
    for (const [field, prov] of Object.entries(row.fields)) {
      expect(validateProvenance(prov as Provenance), `trường ${field}`).toEqual([]);
    }
  });

  it("thời điểm nguồn lấy từ crawled_at theo giờ Việt Nam", () => {
    expect(row.fields.name.observedAt).toBe("2026-07-17T11:40:50+07:00");
    expect(parseCrawledAt("2026-07-17 11:40:50")).toBe("2026-07-17T11:40:50+07:00");
    expect(parseCrawledAt("hôm qua")).toBeNull();
  });

  it("truy ngược được về tệp, dòng và trường nguồn", () => {
    expect(row.recordKey).toBe(`${SRC}#L42`);
    expect(row.fields.roomAreaMinM2.recordLocation).toBe(`${SRC}#L42/specs/Phạm vi sử dụng`);
  });

  it("trường phân loại ngành cũng có nguồn chứng minh riêng", () => {
    expect(row.fields.sourceCategoryName.rawValue).toBe("Máy lạnh");
    expect(row.fields.sourceCategoryName.normalizedValue).toEqual({
      status: "observed",
      value: "máy lạnh",
    });
    expect(row.fields.sourceCategoryName.transformRule).toBe("category_aircon@v1");
  });

  it("cùng đầu vào luôn cho cùng kết quả", () => {
    expect(normalizeAirconRecord(VALID, OPTS)).toEqual(row);
  });
});

describe("dữ liệu thiếu — giữ trạng thái vắng mặt, không đoán thêm", () => {
  const bare = {
    product_id: "361686",
    sku: "1751098000198",
    name: null,
    brand: "Funiki",
    category: { id: null, name: "Máy lạnh" },
    price: { original: null, sale: null, currency: "VND" },
    url: null,
    crawled_at: null,
    specs: {},
  };
  const row = normalizeAirconRecord(bare, OPTS);

  it("trường không có trong nguồn → absent kèm lý do, không bịa giá trị", () => {
    expect(row.fields.name.normalizedValue).toEqual({ status: "absent", reason: "missing" });
    expect(row.fields.priceObservedVnd.normalizedValue).toEqual({ status: "absent", reason: "missing" });
    expect(row.fields.roomAreaMinM2.normalizedValue).toEqual({ status: "absent", reason: "missing" });
  });

  it("thiếu url và crawled_at → KHÔNG đủ điều kiện hiển thị, nêu rõ từng lý do", () => {
    expect(row.displayEligible).toBe(false);
    expect(row.displayIneligibilityReasons).toEqual([
      "thiếu đường dẫn nguồn (url)",
      "thiếu thời điểm ghi nhận (crawled_at)",
    ]);
  });

  it("không có crawled_at → thời điểm nguồn lùi về thời điểm commit tệp dữ liệu", () => {
    expect(row.fields.brand.observedAt).toBe(FALLBACK_AT);
    expect(row.fields.brand.sourceUrl).toBe(`file://${SRC}`); // không có url → trỏ tệp nội bộ
  });

  it("provenance của trường vắng mặt vẫn qua cổng hợp đồng", () => {
    for (const prov of Object.values(row.fields)) {
      expect(validateProvenance(prov as Provenance)).toEqual([]);
    }
  });

  it("nguồn ghi 'Hãng không công bố' / 'Đang cập nhật' → lý do vắng mặt tương ứng", () => {
    expect(parseNoiseDb("Hãng không công bố")).toEqual({ status: "absent", reason: "undisclosed" });
    expect(parseEnergyStars("Đang cập nhật")).toEqual({ status: "absent", reason: "pending_update" });
    // "Không có" là dữ kiện quan sát được: KHÔNG có nhãn — khác với không công bố.
    expect(parseEnergyStars("Không có")).toEqual({ status: "observed", value: 0 });
  });
});

describe("dữ liệu mâu thuẫn hoặc sai dạng — đánh dấu invalid, giữ nguyên gốc", () => {
  it("giá trị đọc không ra số → absent(invalid), không ép kết quả", () => {
    expect(parseAreaM2("Không").min).toEqual({ status: "absent", reason: "invalid" });
    expect(parseEnergyStars("theo tiêu chuẩn châu Âu")).toEqual({ status: "absent", reason: "invalid" });
    expect(parseNoiseDb("rất êm")).toEqual({ status: "absent", reason: "invalid" });
    expect(parseInverter("Không")).toEqual({ status: "absent", reason: "invalid" });
  });

  it("chuỗi phủ định chứa từ khoá không bị đọc nhầm", () => {
    expect(parseInverter("Máy lạnh không Inverter")).toEqual({
      status: "observed",
      value: "non_inverter",
    });
  });

  it("phần thể tích m³ trong ngoặc không lẫn vào diện tích m²", () => {
    const r = parseAreaM2("Dưới 15m² (từ 30 đến 45m³)");
    expect(r.min).toEqual({ status: "observed", value: 0 });
    expect(r.max).toEqual({ status: "observed", value: 15 });
  });

  it("hai trường diện tích cho số KHÁC nhau → giữ CẢ HAI dạng conflicting, không chọn hộ", () => {
    const r = parseAreaFromSpecs({
      "Phạm vi sử dụng": "Từ 15 - 20m² (từ 40 đến 60m³)",
      "Phạm vi làm lạnh hiệu quả": "Từ 20 - 30m2 (từ 60 đến 80m3)",
    });
    expect(r.min).toEqual({ status: "conflicting", values: [15, 20] });
    expect(r.max).toEqual({ status: "conflicting", values: [20, 30] });
    // Cả hai nguyên văn đều được giữ, ghi rõ trường nào nói gì.
    expect(r.rawValue).toContain("Phạm vi sử dụng");
    expect(r.rawValue).toContain("Phạm vi làm lạnh hiệu quả");
    expect(r.fieldPath).toBe("specs/Phạm vi sử dụng | specs/Phạm vi làm lạnh hiệu quả");
  });

  it("hai trường diện tích ĐỒNG THUẬN → dùng giá trị chung, không báo mâu thuẫn", () => {
    const r = parseAreaFromSpecs({
      "Phạm vi sử dụng": "Từ 15 - 20m² (từ 40 đến 60m³)",
      "Phạm vi làm lạnh hiệu quả": "Từ 15 - 20m2 (từ 40 đến 60m3)",
    });
    expect(r.min).toEqual({ status: "observed", value: 15 });
    expect(r.max).toEqual({ status: "observed", value: 20 });
  });

  it("số ngăn nghìn kiểu Việt Nam không bị đọc thành thập phân", () => {
    expect(parseCoolingCapacity("1.5 HP - 12.000 BTU")).toEqual({
      btu: { status: "observed", value: 12000 },
      hp: { status: "observed", value: 1.5 },
    });
  });
});

describe("bản ghi trùng — phát hiện và báo, không tự gộp", () => {
  it("cùng product_id nhưng khác sku vẫn chỉ được ĐÁNH DẤU trùng", () => {
    const rows = [
      { lineNo: 1, record: { product_id: "9999", sku: "A" } },
      { lineNo: 2, record: { product_id: "9999", sku: "B" } },
      { lineNo: 3, record: { product_id: "9999", sku: "C" } },
      { lineNo: 4, record: { product_id: "1", sku: "D" } },
    ];
    const dup = detectDuplicates(rows);
    expect(dup.rule).toBe("no_merge@v1");
    expect(dup.groupCount).toBe(1);
    expect(dup.recordCount).toBe(3);
    expect(dup.groups[0]).toEqual({ key: "product_id:9999", productId: "9999", lines: [1, 2, 3] });
    // 4 bản ghi vào thì cả 4 còn nguyên — không bản ghi nào bị gộp mất.
    expect(rows).toHaveLength(4);
  });

  it("không có product_id thì không bị gán bừa vào nhóm trùng", () => {
    const dup = detectDuplicates([
      { lineNo: 1, record: { sku: "A" } },
      { lineNo: 2, record: { sku: "A" } },
    ]);
    expect(dup.groupCount).toBe(0);
  });
});

describe("dòng lỗi — cô lập từng dòng, không hỏng cả lần nạp", () => {
  it("JSON hỏng → trạng thái error kèm vị trí và lý do", () => {
    const out = classifyLine("{đây không phải json", 7);
    expect(out.status).toBe(STATUS.ERROR);
    expect(out.lineNo).toBe(7);
    expect(out.reason).toContain("JSON hỏng");
  });

  it("JSON hợp lệ nhưng không phải object → error, không đi tiếp", () => {
    expect(classifyLine("[1,2,3]", 8).status).toBe(STATUS.ERROR);
    expect(classifyLine('"chuỗi"', 9).status).toBe(STATUS.ERROR);
  });

  it("không còn mã nhận biết nào → tạm cách ly, vẫn được đếm", () => {
    const out = classifyLine(JSON.stringify({ brand: "LG", price: null }), 10);
    expect(out.status).toBe(STATUS.QUARANTINED);
    expect(out.reason).toContain("không có mã nhận biết");
  });

  it("mỗi dòng vào đúng một trạng thái — ba dòng ba trạng thái khác nhau", () => {
    const statuses = [
      classifyLine(JSON.stringify(VALID), 1).status,
      classifyLine(JSON.stringify({ brand: "x" }), 2).status,
      classifyLine("hỏng{", 3).status,
    ];
    expect(statuses).toEqual([STATUS.SUCCESS, STATUS.QUARANTINED, STATUS.ERROR]);
  });
});

describe("quy tắc ngành và điều kiện hiển thị", () => {
  it("nhận ngành máy lạnh bằng quy tắc chuẩn hoá tên nhóm hàng, không phân biệt hoa thường", () => {
    expect(isAircon({ category: { name: "Máy lạnh" } })).toBe(true);
    expect(isAircon({ category: { name: "  MÁY LẠNH " } })).toBe(true);
    expect(isAircon({ category: { name: "Điều hòa" } })).toBe(true);
    expect(isAircon({ category: { name: "Quạt các loại" } })).toBe(false);
    expect(isAircon({ category: { name: null } })).toBe(false);
    expect(isAircon({})).toBe(false);
  });

  it("có mã nhận biết (dù không có tên) + url + crawled_at → đủ điều kiện", () => {
    const rec = { sku: "ABC-1", url: "https://x.vn/p", crawled_at: "2026-07-17 00:00:00" };
    expect(displayIneligibilityReasons(rec)).toEqual([]);
  });

  it("thiếu bất kỳ vế nào trong ba vế → nêu đúng lý do thiếu", () => {
    expect(displayIneligibilityReasons({ url: "https://x.vn", crawled_at: "2026-07-17 00:00:00" }))
      .toEqual(["thiếu tên hoặc mã nhận biết"]);
    expect(displayIneligibilityReasons({ sku: "A", crawled_at: "2026-07-17 00:00:00" }))
      .toEqual(["thiếu đường dẫn nguồn (url)"]);
    expect(displayIneligibilityReasons({ sku: "A", url: "https://x.vn" }))
      .toEqual(["thiếu thời điểm ghi nhận (crawled_at)"]);
  });
});
