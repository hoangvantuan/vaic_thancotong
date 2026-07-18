// Ingest chính sách công khai của ĐMX (bảo hành/đổi trả, giao hàng/lắp đặt…) từ
// docs/raw/*.md (bị .gitignore vì thư mục chung có data nhạy cảm) vào
// web/data/policies.json — file NÀY được commit + bundle để deploy public dùng được.
//
// Nội dung policy là văn bản công khai trên dienmayxanh.com, KHÔNG chứa PII, nên
// tách ra khỏi docs/raw là an toàn. Chạy: node scripts/ingest-policies.mjs (từ web/).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(here, "..", "..");

const indexPath = join(repoRoot, "docs/dataset/knowledge/policies.index.json");
const index = JSON.parse(readFileSync(indexPath, "utf8"));

const policies = index.policies.map((p) => {
  const content = readFileSync(join(repoRoot, p.file), "utf8").replace(/\r\n/g, "\n").trim();
  return { slug: p.slug, title: p.title, content };
});

const outPath = join(webRoot, "data/policies.json");
writeFileSync(outPath, JSON.stringify(policies, null, 2), "utf8");
console.log(`Ingest ${policies.length} policies -> data/policies.json`);
for (const p of policies) console.log(`  - ${p.slug} (${p.content.length} chars)`);
