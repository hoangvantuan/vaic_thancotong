// Trích dữ liệu theo NGÀNH từ kho sạch dùng chung → mỗi ngành một file gọn cho app.
//
//   Nguồn : ../docs/dataset/catalog/catalog.jsonl   (21.166 sp, single source of truth)
//   Đích  : web/data/<slug>.json                    (chỉ sp có tên thương mại)
//   Cấu hình: web/config/categories.json            (dùng CHUNG với app — một nguồn sự thật)
//
// Chỉ giữ các field mà config khai báo (fit + highlights). Vừa cho file nhỏ, vừa siết
// guardrail: field không khai báo thì không bao giờ tới được tay LLM.
//
// Chạy:  npm run data:extract

import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");

const SRC =
  process.env.CATALOG_SOURCE ??
  resolve(REPO_ROOT, "docs/dataset/catalog/catalog.jsonl");
const OUT_DIR = resolve(WEB_ROOT, "data");

const { categories } = JSON.parse(
  readFileSync(resolve(WEB_ROOT, "config/categories.json"), "utf8")
);

// Tra ngược: tên nhóm hàng trong dữ liệu → cấu hình ngành.
const bySourceName = new Map();
for (const c of categories) {
  for (const n of c.sourceCategoryNames) bySourceName.set(n, c);
}

/** Danh sách field specs cần giữ cho một ngành = field của fit + của highlights. */
function keepFieldsOf(cat) {
  const keep = new Set();
  for (const f of cat.fit?.fields ?? []) keep.add(f);
  for (const h of cat.highlights) for (const f of h.fields) keep.add(f);
  for (const b of cat.banned) keep.delete(b); // an toàn kép
  return keep;
}

const TOP_FIELDS = [
  "product_id", "sku", "name", "brand", "price", "rating",
  "quantity_sold", "image_url", "url", "promotion",
];

async function main() {
  const keepBySlug = new Map(categories.map((c) => [c.slug, keepFieldsOf(c)]));
  const out = new Map(categories.map((c) => [c.slug, []]));

  const rl = createInterface({
    input: createReadStream(SRC, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let scanned = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    scanned++;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const cat = bySourceName.get(rec?.category?.name);
    if (!cat) continue;
    // Chỉ sp có tên thương mại — sp chỉ-spec (name=null) không tư vấn cho khách.
    if (!rec.name) continue;

    const slim = {};
    for (const f of TOP_FIELDS) if (f in rec) slim[f] = rec[f];

    const keep = keepBySlug.get(cat.slug);
    const specs = {};
    for (const [k, v] of Object.entries(rec.specs ?? {})) {
      if (keep.has(k)) specs[k] = v;
    }
    slim.specs = specs;
    out.get(cat.slug).push(slim);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  for (const c of categories) {
    const rows = out.get(c.slug);
    total += rows.length;
    writeFileSync(
      resolve(OUT_DIR, `${c.slug}.json`),
      JSON.stringify(rows),
      "utf8"
    );
    console.log(`  ${c.emoji} ${c.label.padEnd(12)} ${String(rows.length).padStart(5)} sp → data/${c.slug}.json`);
  }
  console.log(`[extract] quét ${scanned} bản ghi → ${total} sp thuộc ${categories.length} ngành`);
}

main().catch((err) => {
  console.error("[extract] LỖI:", err.message);
  console.error(`Kiểm tra file nguồn tồn tại: ${SRC}`);
  process.exit(1);
});
