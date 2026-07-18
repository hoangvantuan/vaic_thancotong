// Lệnh nạp dữ liệu sản phẩm kèm nguồn chứng minh (#25).
//
//   Nguồn : ../docs/dataset/catalog/catalog.jsonl  (kho sạch dùng chung, jsonl)
//   Đích  : web/data/ingest/may_lanh.normalized.json  — 100% bản ghi ngành máy lạnh,
//                                                       mỗi trường một nguồn chứng minh
//           web/data/ingest/ingest-report.json        — báo cáo nạp + đối chiếu số liệu
//           web/data/ingest/ingest-ledger.csv         — sổ cái: MỖI dòng nguồn xuất hiện
//                                                       đúng một lần với đúng một trạng thái
//
// Nguyên tắc: một dòng hỏng không làm hỏng cả lần nạp; không gộp bản ghi trùng;
// không đoán trường thiếu; cùng đầu vào luôn cho cùng kết quả.
//
// Chạy:  npm run data:ingest

import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STATUS,
  RULE_AIRCON,
  RULE_DEDUPE,
  RULE_DISPLAY,
  classifyLine,
  compareWithReference,
  detectDuplicates,
  firstIdentifier,
  isAircon,
  normalizeAirconRecord,
} from "./ingest/catalog-ingest-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");

const SRC_ABS =
  process.env.CATALOG_SOURCE ?? resolve(REPO_ROOT, "docs/dataset/catalog/catalog.jsonl");
const SRC_REL = relative(REPO_ROOT, SRC_ABS);
const OUT_DIR = resolve(WEB_ROOT, "data/ingest");

/** Bọc một ô CSV: quote khi chứa dấu phẩy/ngoặc kép/xuống dòng, giữ nguyên giá trị. */
function csvCell(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Chạy git, trả null nếu không lấy được (ngoài kho git thì báo cáo ghi null). */
function git(...args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  const repoCommit = git("rev-parse", "HEAD");
  const dataFileLog = git("log", "-1", "--format=%H|%cI", "--", SRC_REL);
  const [dataFileCommit, dataFileCommittedAt] = dataFileLog?.split("|") ?? [null, null];

  // Thời điểm nguồn dự phòng cho bản ghi thiếu crawled_at: thời điểm commit của
  // tệp dữ liệu — giá trị chắc chắn đã tồn tại không muộn hơn lúc đó. Không có
  // thời điểm commit thì DỪNG: mọi thời điểm thay thế khác đều là bịa, và
  // provenance với observedAt bịa vẫn qua được cổng kiểm tra — nguy hiểm hơn lỗi.
  if (!dataFileCommittedAt) {
    throw new Error(
      `không lấy được thời điểm commit của ${SRC_REL} — tệp nguồn phải nằm trong git để có thời điểm nguồn dự phòng`
    );
  }
  const fallbackObservedAt = dataFileCommittedAt;

  const rl = createInterface({
    input: createReadStream(SRC_ABS, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const totals = { [STATUS.SUCCESS]: 0, [STATUS.QUARANTINED]: 0, [STATUS.ERROR]: 0 };
  const errors = [];
  const quarantined = [];
  const successRows = []; // { lineNo, record } — cho bước phát hiện trùng toàn cục
  const airconRows = [];
  const ledger = ["line,status,identifier,aircon,display_eligible,reason"];

  let lineNo = 0;
  for await (const line of rl) {
    lineNo += 1; // số dòng VẬT LÝ — đếm cả dòng trắng để recordLocation không lệch
    if (!line.trim()) continue; // dòng trắng không phải bản ghi, không vào sổ cái
    const outcome = classifyLine(line, lineNo);
    totals[outcome.status] += 1;

    let aircon = false;
    let displayEligible = false;
    let identifier = "";

    if (outcome.status === STATUS.ERROR) {
      errors.push({
        line: lineNo,
        location: `${SRC_REL}#L${lineNo}`,
        reason: outcome.reason,
        preview: line.slice(0, 120),
      });
    } else if (outcome.status === STATUS.QUARANTINED) {
      quarantined.push({ line: lineNo, location: `${SRC_REL}#L${lineNo}`, reason: outcome.reason });
    } else {
      const record = outcome.record;
      identifier = firstIdentifier(record)?.value ?? "";
      successRows.push({ lineNo, record });
      aircon = isAircon(record);
      if (aircon) {
        const normalized = normalizeAirconRecord(record, {
          sourcePath: SRC_REL,
          lineNo,
          fallbackObservedAt,
        });
        displayEligible = normalized.displayEligible;
        airconRows.push(normalized);
      }
    }
    // Sổ cái: mỗi dòng nguồn đúng một lần, đúng một trạng thái, kèm lý do khi
    // không thành công. Giá trị được quote CSV — không làm rỗng giá trị đã quan sát.
    ledger.push(
      [
        lineNo,
        outcome.status,
        csvCell(identifier),
        aircon ? 1 : 0,
        displayEligible ? 1 : 0,
        csvCell(outcome.reason ?? ""),
      ].join(",")
    );
  }

  // Phát hiện trùng — toàn kho và riêng ngành máy lạnh. Không gộp (no_merge@v1).
  const dupAll = detectDuplicates(successRows);
  const airconLineSet = new Set(airconRows.map((r) => r.sourceLine));
  const dupAircon = {
    ...dupAll,
    groups: dupAll.groups.filter((g) => g.lines.some((l) => airconLineSet.has(l))),
  };
  dupAircon.groupCount = dupAircon.groups.length;
  dupAircon.recordCount = dupAircon.groups.reduce((n, g) => n + g.lines.length, 0);

  // Gắn nhãn nhóm trùng vào bản ghi máy lạnh đã chuẩn hoá — gắn nhãn, không gộp.
  const groupByLine = new Map();
  for (const g of dupAircon.groups) for (const l of g.lines) groupByLine.set(l, g.key);
  for (const row of airconRows) {
    row.duplicateGroup = groupByLine.get(row.sourceLine) ?? null;
  }

  const actualCounts = {
    totalProducts: totals[STATUS.SUCCESS] + totals[STATUS.QUARANTINED] + totals[STATUS.ERROR],
    airconRecords: airconRows.length,
    airconDisplayEligible: airconRows.filter((r) => r.displayEligible).length,
    airconWithObservedPrice: airconRows.filter(
      (r) => r.displayEligible && r.fields.priceObservedVnd.normalizedValue.status === "observed"
    ).length,
  };

  // Báo cáo TẤT ĐỊNH: cùng dữ liệu đầu vào → cùng nội dung từng byte. Thời điểm
  // định danh lần nạp là thời điểm commit dữ liệu, không phải giờ chạy lệnh.
  const report = {
    tool: "web/scripts/ingest-catalog.mjs",
    commits: {
      repo: repoCommit,
      dataFile: dataFileCommit,
      dataFileCommittedAt,
    },
    sources: [
      {
        path: SRC_REL,
        format: "jsonl",
        recordsFound: actualCounts.totalProducts,
        role: "kho sạch dùng chung — nguồn bản ghi duy nhất của lần nạp này",
      },
      {
        path: "docs/dataset/catalog/catalog.index.json",
        format: "json",
        recordsFound: 0,
        role: "siêu dữ liệu của kho (không chứa bản ghi sản phẩm)",
      },
      {
        path: "docs/raw/products_detail.json",
        format: "json",
        recordsFound: null,
        role: "nguồn thượng nguồn — đã hợp nhất vào catalog.jsonl bởi scripts/build_catalog.py, không quét lại ở phiếu này",
      },
      {
        path: "docs/raw/Spec_cate_gia.xlsx",
        format: "xlsx",
        recordsFound: null,
        role: "nguồn thượng nguồn — đã hợp nhất vào catalog.jsonl bởi scripts/build_catalog.py, không quét lại ở phiếu này",
      },
    ],
    policies: {
      observedAt:
        "observedAt = crawled_at (giờ Việt Nam, +07:00); bản ghi không có crawled_at dùng thời điểm commit của tệp dữ liệu",
      duplicates: `${RULE_DEDUPE} — chỉ phát hiện và báo; không gộp vì chưa có quy tắc gộp được ghi nhận và cùng product_id chưa chắc cùng sản phẩm`,
      airconClassification: `${RULE_AIRCON} — NFC + trim + lowercase tên nhóm hàng, so với {"máy lạnh","điều hòa","điều hoà"}`,
      displayEligibility: `${RULE_DISPLAY} — cần đủ tên/mã nhận biết + đường dẫn nguồn (url) + thời điểm ghi nhận (crawled_at)`,
      priceLabel: "giá là GIÁ ĐÃ QUAN SÁT kèm observedAt — không phải giá hiện tại",
      areaArbitration:
        "parse_area_m2@v2 — hai trường diện tích cùng nghĩa: một trường có mặt thì dùng trường đó; cả hai cùng giá trị thì dùng; khác giá trị thì giữ CẢ HAI dạng conflicting, không chọn hộ",
    },
    statusTotals: {
      success: totals[STATUS.SUCCESS],
      quarantined: totals[STATUS.QUARANTINED],
      error: totals[STATUS.ERROR],
      total: actualCounts.totalProducts,
    },
    duplicates: {
      wholeCatalog: { groupCount: dupAll.groupCount, recordCount: dupAll.recordCount },
      aircon: {
        groupCount: dupAircon.groupCount,
        recordCount: dupAircon.recordCount,
        groups: dupAircon.groups,
      },
    },
    aircon: actualCounts,
    referenceComparison: compareWithReference(actualCounts),
    quarantined,
    errors: errors.slice(0, 100),
    errorCount: errors.length,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "may_lanh.normalized.json"), JSON.stringify(airconRows), "utf8");
  writeFileSync(resolve(OUT_DIR, "ingest-report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(resolve(OUT_DIR, "ingest-ledger.csv"), ledger.join("\n") + "\n", "utf8");

  console.log(`[ingest] nguồn      ${SRC_REL} @ ${dataFileCommit ?? "ngoài git"}`);
  console.log(
    `[ingest] trạng thái  thành công ${totals[STATUS.SUCCESS]} · cách ly ${totals[STATUS.QUARANTINED]} · lỗi ${totals[STATUS.ERROR]} (tổng ${actualCounts.totalProducts})`
  );
  console.log(
    `[ingest] máy lạnh    ${actualCounts.airconRecords} bản ghi · ${actualCounts.airconDisplayEligible} đủ điều kiện hiển thị · ${actualCounts.airconWithObservedPrice} có giá đã quan sát`
  );
  console.log(
    `[ingest] trùng       toàn kho ${dupAll.groupCount} nhóm/${dupAll.recordCount} bản ghi · máy lạnh ${dupAircon.groupCount} nhóm/${dupAircon.recordCount} bản ghi (không gộp)`
  );
  for (const cmp of report.referenceComparison) {
    const mark = cmp.delta === 0 ? "khớp" : `LỆCH ${cmp.delta > 0 ? "+" : ""}${cmp.delta}`;
    console.log(`[ingest] đối chiếu   ${cmp.metric}: ${cmp.actual}/${cmp.reference} — ${mark}`);
  }
  console.log(`[ingest] ghi ra      web/data/ingest/{may_lanh.normalized.json, ingest-report.json, ingest-ledger.csv}`);
}

main().catch((err) => {
  console.error("[ingest] LỖI:", err.message);
  console.error(`Kiểm tra file nguồn tồn tại: ${SRC_ABS}`);
  process.exit(1);
});
