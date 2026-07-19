// SCAFFOLD NGÀNH HÀNG MỚI — máy làm 90%, người duyệt 10%.
//
//   1. Quét kho nguồn (catalog.jsonl) lấy THỐNG KÊ thật của nhóm hàng: số sản phẩm,
//      hãng, field specs nào có mặt nhiều + giá trị mẫu.
//   2. Nhờ LLM (OpenAI-compatible, cấu hình qua ENV như app) DRAFT entry config:
//      keywords văn nói, fit (tiêu chí hoàn cảnh), highlights, câu hỏi ngược.
//   3. VALIDATE draft trên dữ liệu thật (field phải tồn tại, parser phải có thật),
//      ghi vào config/categories.json rồi chạy lại data:extract (sinh data + loaders).
//
// Người duyệt diff trước khi commit — phrasebook (`plain`) cố tình KHÔNG draft tự
// động vì đó là câu chữ đã duyệt, phải người viết.
//
// Chạy:
//   npm run category:scaffold -- "Nồi cơm điện"
//   npm run category:scaffold -- "Nồi cơm điện" --slug noi_com_dien --dry-run
//   npm run category:scaffold -- "Nồi cơm điện" --no-llm   (chỉ sinh khung + TODO)

import { createReadStream, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const CONFIG_PATH = resolve(WEB_ROOT, "config/categories.json");
const SRC =
  process.env.CATALOG_SOURCE ??
  resolve(REPO_ROOT, "docs/dataset/catalog/catalog.jsonl");

// ---------- Tham số ----------

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--") && !a.includes("=")));
const sourceName = argv.find((a) => !a.startsWith("--"));
const slugArg = (() => {
  const i = argv.indexOf("--slug");
  return i >= 0 ? argv[i + 1] : null;
})();
const DRY_RUN = flags.has("--dry-run");
const NO_LLM = flags.has("--no-llm");

if (!sourceName) {
  console.error('Cách dùng: npm run category:scaffold -- "<Tên nhóm hàng trong kho nguồn>" [--slug ten_slug] [--dry-run] [--no-llm]');
  console.error('Ví dụ:     npm run category:scaffold -- "Nồi cơm điện"');
  process.exit(1);
}

// ---------- ENV: đọc .env.local như app (không đè biến đã set) ----------

function loadEnvLocal() {
  const p = resolve(WEB_ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] != null) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnvLocal();

const LLM = {
  baseURL: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: process.env.LLM_API_KEY ?? "ollama",
  model: process.env.LLM_MODEL ?? "qwen2.5:7b",
};

// ---------- Tiện ích ----------

/** Bỏ dấu + thường hoá — cùng cách fold của app để so tên/nghĩ slug nhất quán. */
function fold(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

const toSlug = (s) => fold(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- Bước 1: thống kê kho nguồn ----------

async function scanSource(wantedFolded) {
  const rl = createInterface({
    input: createReadStream(SRC, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const nameVariants = new Map(); // tên gốc → số bản ghi
  const brands = new Map();
  const fields = new Map(); // field → { count, samples:Set }
  let matched = 0;
  let named = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const catName = rec?.category?.name;
    if (!catName || fold(catName) !== wantedFolded) continue;
    matched++;
    nameVariants.set(catName, (nameVariants.get(catName) ?? 0) + 1);
    if (!rec.name) continue; // app chỉ tư vấn sp có tên thương mại
    named++;
    if (rec.brand) brands.set(rec.brand, (brands.get(rec.brand) ?? 0) + 1);
    for (const [k, v] of Object.entries(rec.specs ?? {})) {
      if (typeof v !== "string" || !v.trim()) continue;
      let f = fields.get(k);
      if (!f) fields.set(k, (f = { count: 0, samples: new Set() }));
      f.count++;
      if (f.samples.size < 4) f.samples.add(trunc(v.trim(), 90));
    }
  }
  return { matched, named, nameVariants, brands, fields };
}

// ---------- Bước 2: LLM draft ----------

/** Tên parser có thật, đọc từ chính parsers.ts để không lệch code. */
function readParserNames() {
  const src = readFileSync(resolve(WEB_ROOT, "lib/data/parsers.ts"), "utf8");
  const block = src.match(/export const PARSERS[^{]*\{([^}]*)\}/);
  if (!block) return [];
  return [...block[1].matchAll(/^\s*([a-zA-Z0-9_]+)\s*,?\s*$/gm)].map((m) => m[1]);
}

function buildPrompt(stats, parserNames, example, slugSuggestion) {
  const fieldLines = [...stats.fields.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)
    .map(([k, f]) => `- "${k}" (${f.count}/${stats.named} sp): ${[...f.samples].map((s) => JSON.stringify(s)).join(" | ")}`)
    .join("\n");
  const brandLine = [...stats.brands.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([b, c]) => `${b} (${c})`)
    .join(", ");

  return `Bạn giúp cấu hình một NGÀNH HÀNG mới cho trợ lý tư vấn điện máy tiếng Việt.

NHÓM HÀNG: "${sourceName}" — ${stats.named} sản phẩm có tên thương mại. Hãng: ${brandLine}.

FIELD SPECS CÓ THẬT (kèm độ phủ và giá trị mẫu — CHỈ được dùng các field này):
${fieldLines}

PARSER CÓ THẬT (fit.parser CHỈ được chọn trong đây): ${parserNames.join(", ")}.
- roomAreaRange: chuỗi kiểu "Từ 15 - 20m²"; peopleRange: "Từ 3 - 5 người"; inches: "65 inch"; gigabytes: "16 GB".

VÍ DỤ entry ngành đã có (để đúng format):
${JSON.stringify(example, null, 2)}

YÊU CẦU — trả về DUY NHẤT một object JSON entry cho ngành mới, không markdown, không giải thích:
- "slug": "${slugSuggestion}" (giữ nguyên trừ khi quá xấu), "label": tên ngắn tiếng Việt có dấu, "emoji": 1 emoji hợp ngành.
- "keywords": 5-10 cách khách Việt hay GỌI ngành này trong văn nói (có dấu + không dấu + tiếng Anh thông dụng). KHÔNG trùng nghĩa với ngành khác.
- "keywordBlockers": (tuỳ chọn) từ khiến keyword bị hiểu nhầm sang ngành khác, không có thì bỏ field.
- "intentCue": hoàn cảnh đời thường gợi ra ngành này, vd "trời nóng/phòng oi bức".
- "fit": tiêu chí HOÀN CẢNH quyết định chọn size/công suất (diện tích, số người, inch…) nếu ngành có; field phải nằm trong danh sách trên và parser phải parse được giá trị mẫu. Kèm "question" (câu hỏi ngược lịch sự, xưng em), "subject", "slack", "spread", "critical" nếu tiêu chí là bắt buộc. KHÔNG có tiêu chí như vậy thì để null.
- "highlights": 2-4 thông số đáng khoe nhất với khách (field có độ phủ cao), format "text" (KHÔNG dùng "plain" — phần đó người viết sau).
- "search": (tuỳ chọn) { "fields": [...] } field chứa tag tiện ích/công nghệ cho tầng search.
- "banned": field TUYỆT ĐỐI không đưa cho LLM tư vấn (thông tin pháp lý, link, serial…), thường để [].
- "sourceCategoryNames": để [] — script tự điền từ dữ liệu.`;
}

async function llmDraft(prompt) {
  const res = await fetch(`${LLM.baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM.apiKey}`,
    },
    body: JSON.stringify({
      model: LLM.model,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`LLM trả ${res.status}: ${trunc(await res.text(), 300)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error(`LLM không trả JSON: ${trunc(cleaned, 300)}`);
  return JSON.parse(cleaned.slice(s, e + 1));
}

/** Khung tối thiểu khi không có LLM — chạy được ngay, người điền nốt chỗ TODO. */
function skeletonDraft(stats, slugSuggestion) {
  const topFields = [...stats.fields.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([k]) => k);
  return {
    slug: slugSuggestion,
    label: sourceName,
    emoji: "🛒",
    keywords: [sourceName.toLowerCase(), fold(sourceName)],
    intentCue: null,
    banned: [],
    fit: null,
    highlights: topFields.map((f) => ({ label: f, format: "text", fields: [f] })),
  };
}

// ---------- Bước 3: validate trên dữ liệu thật ----------

/**
 * Bản SOI của các parser trong lib/data/parsers.ts — CHỈ để kiểm chứng draft
 * (fit.parser có đọc được giá trị mẫu không), không phải parser runtime.
 * Thêm parser mới bên parsers.ts thì thêm probe tương ứng ở đây.
 */
const PARSER_PROBES = {
  roomAreaRange: (s) => /(Từ\s*\d+\s*[-–]\s*\d+|Dưới\s*\d+|Trên\s*\d+)\s*m/iu.test(s),
  peopleRange: (s) => /(Trên|Dưới|Từ)?\s*\d+\s*(?:[-–]\s*\d+\s*)?người/iu.test(s),
  inches: (s) => /\d{2,3}(?:[.,]\d)?\s*(?:inch|"|”)/iu.test(s),
  gigabytes: (s) => /\d+(?:[.,]\d+)?\s*(GB|MB|TB)/iu.test(s),
};

/** % giá trị mẫu của các field mà parser đọc được (0–1); null nếu chưa có probe. */
function probeParser(parser, fields, stats) {
  const probe = PARSER_PROBES[parser];
  if (!probe) return null;
  const samples = fields.flatMap((f) => [...(stats.fields.get(f)?.samples ?? [])]);
  if (!samples.length) return 0;
  return samples.filter(probe).length / samples.length;
}

function validateDraft(draft, stats, parserNames, existingSlugs, warns) {
  const knownFields = new Set(stats.fields.keys());
  const fieldsOk = (arr) => (arr ?? []).filter((f) => {
    if (knownFields.has(f)) return true;
    warns.push(`bỏ field không tồn tại trong dữ liệu: "${f}"`);
    return false;
  });

  const slug = slugArg ?? draft.slug;
  if (!/^[a-z0-9_]+$/.test(slug ?? "")) throw new Error(`slug không hợp lệ: "${slug}"`);
  if (existingSlugs.has(slug)) throw new Error(`slug "${slug}" đã tồn tại trong config`);

  const entry = {
    slug,
    label: String(draft.label ?? sourceName).trim(),
    emoji: String(draft.emoji ?? "🛒").trim(),
    sourceCategoryNames: [...stats.nameVariants.keys()], // luôn theo dữ liệu thật
    keywords: [...new Set((draft.keywords ?? []).map((k) => String(k).trim()).filter(Boolean))],
    banned: (draft.banned ?? []).map(String),
    fit: null,
    highlights: [],
  };
  if (!entry.keywords.length) entry.keywords = [entry.label.toLowerCase()];
  if (Array.isArray(draft.keywordBlockers) && draft.keywordBlockers.length) {
    entry.keywordBlockers = draft.keywordBlockers.map(String);
  }
  if (draft.intentCue) entry.intentCue = String(draft.intentCue);

  if (draft.fit && typeof draft.fit === "object") {
    const f = draft.fit;
    const fields = fieldsOk(f.fields);
    const parseRate = parserNames.includes(f.parser)
      ? probeParser(f.parser, fields, stats)
      : null;
    if (!parserNames.includes(f.parser)) {
      warns.push(`fit.parser "${f.parser}" không có thật → bỏ fit (khai tay sau nếu cần)`);
    } else if (!fields.length) {
      warns.push("fit không còn field hợp lệ → bỏ fit");
    } else if (parseRate != null && parseRate < 0.5) {
      warns.push(
        `fit.parser "${f.parser}" chỉ đọc được ${Math.round(parseRate * 100)}% giá trị mẫu của ${JSON.stringify(f.fields)} → bỏ fit (chọn field/parser khác hoặc viết parser mới)`
      );
    } else {
      entry.fit = {
        slot: String(f.slot ?? "fitValue"),
        unit: String(f.unit ?? ""),
        parser: f.parser,
        match: f.match === "near" ? "near" : "covers",
        ...(f.tolerance != null ? { tolerance: Number(f.tolerance) } : {}),
        fields,
        question: String(f.question ?? `Anh/chị cho em xin thông tin để chọn ${entry.label.toLowerCase()} phù hợp ạ?`),
        ...(f.subject ? { subject: String(f.subject) } : {}),
        ...(f.slack != null ? { slack: Number(f.slack) } : {}),
        ...(f.spread != null ? { spread: Number(f.spread) } : {}),
        ...(f.critical ? { critical: true } : {}),
      };
    }
  }

  for (const h of draft.highlights ?? []) {
    const fields = fieldsOk(h.fields);
    if (!fields.length) continue;
    if (h.plain) warns.push(`highlight "${h.label}": bỏ "plain" — phrasebook phải người viết và duyệt`);
    entry.highlights.push({ label: String(h.label ?? fields[0]), format: String(h.format ?? "text"), fields });
  }
  if (!entry.highlights.length) warns.push("chưa có highlight hợp lệ — nên khai tay 2-3 thông số đáng khoe");

  const searchFields = fieldsOk(draft.search?.fields);
  if (searchFields.length) entry.search = { fields: searchFields };

  return entry;
}

// ---------- Chạy ----------

async function main() {
  const registry = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const existingSlugs = new Set(registry.categories.map((c) => c.slug));
  const wantedFolded = fold(sourceName);

  const already = registry.categories.find((c) =>
    c.sourceCategoryNames.some((n) => fold(n) === wantedFolded)
  );
  if (already) {
    console.error(`Nhóm "${sourceName}" đã được map vào ngành "${already.slug}" — không cần scaffold.`);
    process.exit(1);
  }

  console.log(`[scaffold] quét kho nguồn tìm nhóm "${sourceName}"…`);
  const stats = await scanSource(wantedFolded);
  if (!stats.matched) {
    console.error(`Không thấy nhóm hàng nào tên (fold) = "${sourceName}" trong ${SRC}.`);
    console.error("Kiểm tra chính tả — tên phải khớp category.name trong kho nguồn (không phân biệt hoa thường/dấu).");
    process.exit(1);
  }
  console.log(
    `[scaffold] ${stats.matched} bản ghi (${stats.named} có tên thương mại), ` +
      `${stats.fields.size} field specs, biến thể tên: ${[...stats.nameVariants.keys()].join(" / ")}`
  );
  if (!stats.named) {
    console.error("Nhóm này không có sản phẩm mang tên thương mại — không có gì để tư vấn.");
    process.exit(1);
  }

  const parserNames = readParserNames();
  const slugSuggestion = slugArg ?? toSlug(sourceName);
  const warns = [];

  let draft;
  if (NO_LLM) {
    draft = skeletonDraft(stats, slugSuggestion);
    warns.push("chạy --no-llm: keywords/fit/câu hỏi là khung thô, cần người điền");
  } else {
    // Ví dụ few-shot: một ngành CÓ fit và một ngành KHÔNG fit để LLM biết cả hai dạng.
    const example = registry.categories.find((c) => c.fit) ?? registry.categories[0];
    console.log(`[scaffold] nhờ LLM (${LLM.model}) draft entry…`);
    try {
      draft = await llmDraft(buildPrompt(stats, parserNames, example, slugSuggestion));
    } catch (err) {
      console.error(`[scaffold] LLM lỗi (${err.message}) → dùng khung thô.`);
      draft = skeletonDraft(stats, slugSuggestion);
      warns.push("LLM không chạy được: entry là khung thô, cần người điền");
    }
  }

  const entry = validateDraft(draft, stats, parserNames, existingSlugs, warns);

  console.log("\n===== ENTRY DRAFT =====");
  console.log(JSON.stringify(entry, null, 2));
  for (const w of warns) console.log(`⚠️  ${w}`);

  if (DRY_RUN) {
    console.log("\n[scaffold] --dry-run: KHÔNG ghi file. Bỏ flag để ghi vào config.");
    return;
  }

  registry.categories.push(entry);
  writeFileSync(CONFIG_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`\n[scaffold] đã thêm ngành "${entry.slug}" vào config/categories.json`);

  console.log("[scaffold] chạy data:extract (sinh data + loaders)…");
  const r = spawnSync(process.execPath, [resolve(__dirname, "extract-catalog.mjs")], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);

  console.log(`
VIỆC CÒN LẠI (người duyệt):
  1. Xem diff config/categories.json — chỉnh keywords/câu hỏi/fit cho chuẩn văn nói.
  2. Highlight nào cần câu đời thường thì viết "plain" (phrasebook) tay.
  3. npm run check — rồi chạy thử hội thoại hỏi "${entry.label.toLowerCase()}".`);
}

main().catch((err) => {
  console.error("[scaffold] LỖI:", err.message);
  process.exit(1);
});
