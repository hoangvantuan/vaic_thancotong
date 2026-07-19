import type {
  CategorySlug,
  Highlight,
  NormalizedPrice,
  NormalizedProduct,
  NumRange,
} from "@/lib/types";
import { getCategory, getParser, type CategoryConfig } from "./category-config";
import { formatHighlight } from "./parsers";

/**
 * Catalog đa ngành — mỗi ngành một file, NẠP LAZY khi lần đầu cần tới rồi cache in-memory.
 *
 * Bảng import TĨNH nằm ở `loaders.generated.ts` — SINH TỰ ĐỘNG từ categories.json bởi
 * `npm run data:extract`: Next vẫn tách được mỗi ngành một chunk riêng, dữ liệu nằm sẵn
 * trong bản build → deploy tất định, không phụ thuộc cwd và không phải trace fs động.
 *
 * Thêm ngành mới: thêm entry vào categories.json rồi chạy `npm run data:extract`
 * (hoặc `npm run category:scaffold` để máy draft entry) — KHÔNG phải sửa code.
 */
import { LOADERS } from "./loaders.generated";

type RawRecord = {
  product_id?: string | null;
  sku?: string | null;
  name?: string | null;
  brand?: string | null;
  price?: { original?: number | null; sale?: number | null } | null;
  rating?: number | null;
  quantity_sold?: number | null;
  image_url?: string | null;
  url?: string | null;
  promotion?: string | null;
  specs?: Record<string, unknown> | null;
};

/** Giá trị đầu tiên có mặt theo thứ tự ưu tiên trong config. */
function firstField(
  specs: Record<string, unknown>,
  fields: string[]
): string | undefined {
  for (const f of fields) {
    const v = specs[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function normalizePrice(raw: RawRecord["price"]): NormalizedPrice {
  const original = typeof raw?.original === "number" ? raw.original : null;
  const sale = typeof raw?.sale === "number" ? raw.sale : null;
  const display = sale ?? original;
  const discountPercent =
    original != null && sale != null && original > sale
      ? Math.round(((original - sale) / original) * 100)
      : null;
  return {
    original,
    sale,
    display,
    hasPrice: typeof display === "number" && display > 0,
    discountPercent,
  };
}

function normalizeOne(
  rec: RawRecord,
  cfg: CategoryConfig
): NormalizedProduct | null {
  const id = rec.product_id ?? rec.sku ?? rec.name;
  if (!id || !rec.name) return null;

  const specs = rec.specs ?? {};

  // Tiêu chí số của ngành (m² / người / inch) — theo config, không hardcode.
  let fit: NumRange | null = null;
  let fitRaw: string | null = null;
  if (cfg.fit) {
    const parse = getParser(cfg.fit.parser);
    for (const f of cfg.fit.fields) {
      const raw = specs[f];
      if (typeof raw === "string" && raw.trim()) {
        const parsed = parse(raw);
        if (parsed) {
          fit = parsed;
          fitRaw = raw.trim();
          break;
        }
      }
    }
  }

  const highlights: Highlight[] = [];
  for (const h of cfg.highlights) {
    const raw = firstField(specs, h.fields);
    if (!raw) continue;
    const { text, title } = formatHighlight(h.format, raw);
    highlights.push({ label: h.label, text, title });
  }

  // rawFields = specs trừ field cấm — nguồn trích dẫn duy nhất cho LLM.
  const rawFields: Record<string, unknown> = { ...specs };
  for (const b of cfg.banned) delete rawFields[b];

  return {
    id: String(id),
    category: cfg.slug,
    categoryLabel: cfg.label,
    name: rec.name,
    brand: rec.brand ?? "Không rõ hãng",
    price: normalizePrice(rec.price),
    rating: typeof rec.rating === "number" ? rec.rating : null,
    quantitySold: typeof rec.quantity_sold === "number" ? rec.quantity_sold : null,
    fit,
    fitRaw,
    highlights,
    imageUrl: rec.image_url ?? null,
    url: rec.url ?? null,
    promotion: rec.promotion ?? null,
    rawFields,
  };
}

const cache = new Map<CategorySlug, NormalizedProduct[]>();

/** Lấy catalog đã chuẩn hoá của một ngành (nạp lần đầu, sau đó dùng cache). */
export async function getCatalog(
  slug: CategorySlug
): Promise<NormalizedProduct[]> {
  const cached = cache.get(slug);
  if (cached) return cached;

  const cfg = getCategory(slug);
  const load = LOADERS[slug];
  if (!cfg || !load) {
    console.error(`[catalog] Chưa cấu hình ngành "${slug}".`);
    return [];
  }

  let raw: RawRecord[] = [];
  try {
    const mod = await load();
    raw = (mod.default ?? mod) as RawRecord[];
  } catch (err) {
    console.error(
      `[catalog] Không nạp được data/${slug}.json. Chạy \`npm run data:extract\`?`,
      (err as Error).message
    );
    return [];
  }

  const products: NormalizedProduct[] = [];
  for (const rec of raw) {
    if (rec?.name == null) continue;
    const n = normalizeOne(rec, cfg);
    if (n) products.push(n);
  }
  cache.set(slug, products);
  console.log(`[catalog] Nạp ${products.length} sản phẩm ${cfg.label}.`);
  return products;
}
