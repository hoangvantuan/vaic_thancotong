// Kiểm thử các hàm trình bày của giao diện trợ lý — thuần logic, không cần DOM.

import { describe, expect, it } from "vitest";
import {
  absenceLabel,
  declineLabel,
  formatObservedAt,
  sourceHost,
  splitClaim,
  verdictLabel,
} from "./present";

describe("present", () => {
  it("splitClaim: tách nhãn:giá trị và Việt hoá khoá đã biết", () => {
    expect(splitClaim("priceVnd: 8.990.000₫")).toEqual({ label: "Giá quan sát", value: "8.990.000₫" });
    expect(splitClaim("capacityBtu: 9.000 BTU")).toEqual({ label: "Công suất", value: "9.000 BTU" });
    expect(splitClaim("khong_co_hai_cham")).toEqual({ label: "", value: "khong_co_hai_cham" });
  });

  it("sourceHost: lấy host, giữ nguyên khi không phải URL", () => {
    expect(sourceHost("https://www.dienmayxanh.com/may-lanh/x")).toBe("www.dienmayxanh.com");
    expect(sourceHost("khong-phai-url")).toBe("khong-phai-url");
  });

  it("formatObservedAt: ISO → dd/mm/yyyy, sai định dạng thì giữ nguyên", () => {
    expect(formatObservedAt("2026-07-18T09:00:00.000Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(formatObservedAt("khong-phai-iso")).toBe("khong-phai-iso");
  });

  it("verdictLabel: đúng tone cho ba trạng thái", () => {
    expect(verdictLabel("eligible").tone).toBe("ok");
    expect(verdictLabel("excluded").tone).toBe("bad");
    expect(verdictLabel("unverified").tone).toBe("warn");
  });

  it("declineLabel & absenceLabel: có nhãn tiếng Việt cho mọi nhánh", () => {
    expect(declineLabel("no_eligible_product")).toMatch(/thoả hết ràng buộc/);
    expect(declineLabel("insufficient_evidence")).toMatch(/dữ kiện/);
    expect(absenceLabel("undisclosed")).toMatch(/không công bố/);
    expect(absenceLabel("missing")).toMatch(/không có/);
  });
});
