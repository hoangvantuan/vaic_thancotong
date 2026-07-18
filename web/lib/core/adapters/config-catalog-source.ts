// NGUỒN SẢN PHẨM THEO KHAI BÁO — hiện thực lời hứa "SP+ / Ngành+" của đề bài.
//
// Thêm một ngành hàng vào bản tư vấn = thả tệp `data/{slug}.json` (đúng dạng BTC cấp)
// + khai một entry trong `config/categories.json`. KHÔNG sửa dòng mã nào ở đây, ở bộ
// luật, hay ở giao diện. Đối tác yêu cầu chứng minh điều này ngay tại chỗ.
//
// Bộ kết nối này KHÔNG chứa luật miền (không lọc, không xếp hạng). Nó chỉ:
//   1. đọc bản ghi thô của ngành,
//   2. suy tiêu chí hoàn cảnh (fitMin/fitMax) bằng ĐÚNG field + parser đã KHAI trong config,
//   3. lấy giá nguyên trạng,
// rồi gắn nguồn chứng minh sáu trường cho từng thuộc tính.
//
// KHÔNG suy diễn: field vắng/không parse được thì để `absent`, KHÔNG lấy giá trị thay thế.

import { absent, observed, ok, type Result, type SourcedValue } from "@/lib/core/contracts/status";
import type { Provenance } from "@/lib/core/contracts/provenance";
import type {
  ProductQuery,
  ProductSource,
  SourcedProduct,
} from "@/lib/core/ports/product-source";
import { getCategory, getParser } from "@/lib/data/category-config";
import type { CategorySlug } from "@/lib/types";

/**
 * Thời điểm QUAN SÁT của bộ dữ liệu BTC cấp. Dữ liệu là bản chụp tĩnh, nên mốc này
 * cố định và đi vào mọi provenance — khách luôn thấy "giá đã quan sát lúc …", không
 * bao giờ bị hiểu nhầm là giá thời gian thực.
 */
const CATALOG_OBSERVED_AT = "2026-07-18T00:00:00.000Z";

/** Bản ghi thô đúng dạng tệp BTC cấp. Mọi field đều có thể vắng. */
interface RawProduct {
  product_id?: string | number | null;
  sku?: string | null;
  name?: string | null;
  brand?: string | null;
  price?: { original?: number | null; sale?: number | null } | null;
  url?: string | null;
  specs?: Record<string, string | number | null> | null;
}

/** Nạp tệp dữ liệu của một ngành. Ngành chưa có tệp → rỗng (không phải lỗi). */
async function loadRaw(slug: CategorySlug): Promise<RawProduct[]> {
  try {
    const mod = await import(`@/data/${slug}.json`);
    const rows = (mod.default ?? mod) as unknown;
    return Array.isArray(rows) ? (rows as RawProduct[]) : [];
  } catch {
    return [];
  }
}

/** Giá trị thô của field đầu tiên đọc được trong danh sách đã KHAI ở config. */
function rawOf(
  specs: Record<string, string | number | null> | null | undefined,
  fields: readonly string[]
): string | null {
  if (!specs) return null;
  for (const f of fields) {
    const v = specs[f];
    if (v !== undefined && v !== null && String(v).trim()) return String(v);
  }
  return null;
}

function prov(
  slug: CategorySlug,
  index: number,
  field: string,
  rawValue: string,
  normalizedValue: SourcedValue<string | number>,
  transformRule: string,
  sourceUrl: string
): Provenance {
  return {
    sourceUrl,
    recordLocation: `${slug}.json#/${index}/${field}`,
    rawValue,
    observedAt: CATALOG_OBSERVED_AT,
    normalizedValue,
    transformRule,
  };
}

export class ConfigCatalogSource implements ProductSource {
  readonly name = "config-catalog@v1";
  private readonly cache = new Map<CategorySlug, SourcedProduct[]>();

  private async all(category: CategorySlug): Promise<SourcedProduct[]> {
    const cached = this.cache.get(category);
    if (cached) return cached;

    // Ngành phải được KHAI trong registry — chưa khai thì không phục vụ.
    const cfg = getCategory(category);
    if (!cfg) {
      this.cache.set(category, []);
      return [];
    }

    const raws = await loadRaw(category);
    const built: SourcedProduct[] = [];

    raws.forEach((rec, index) => {
      const id = rec.product_id ?? rec.sku;
      const displayName = (rec.name ?? "").trim();
      // Không có định danh hoặc không có tên để khách nhận ra → không đưa vào tư vấn.
      if (id === undefined || id === null || String(id).trim() === "" || !displayName) return;

      const sourceUrl = rec.url?.trim() || `file://catalog/${category}`;
      const attributes: Record<string, SourcedValue<string | number>> = {};
      const provenance: Record<string, Provenance> = {};

      // --- Tiêu chí hoàn cảnh: field + parser lấy THẲNG từ khai báo của ngành ---
      if (cfg.fit) {
        const raw = rawOf(rec.specs, cfg.fit.fields);
        const range = raw ? getParser(cfg.fit.parser)(raw) : null;
        const rule = `${cfg.fit.parser}@v1`;
        if (raw && range) {
          attributes.fitMin = observed(range.min);
          provenance.fitMin = prov(category, index, "fitMin", raw, attributes.fitMin, rule, sourceUrl);
          // max = null nghĩa là "trở lên" — giữ đúng ngữ nghĩa, KHÔNG bịa cận trên.
          attributes.fitMax =
            range.max === null ? absent<number>("not_applicable") : observed(range.max);
          provenance.fitMax = prov(category, index, "fitMax", raw, attributes.fitMax, rule, sourceUrl);
        } else {
          attributes.fitMin = absent<number>("missing");
          provenance.fitMin = prov(category, index, "fitMin", raw ?? "", attributes.fitMin, rule, sourceUrl);
          attributes.fitMax = absent<number>("missing");
          provenance.fitMax = prov(category, index, "fitMax", raw ?? "", attributes.fitMax, rule, sourceUrl);
        }
      }

      // --- Giá: lấy nguyên trạng, ưu tiên giá bán thực tế; thiếu là thiếu ---
      const sale = rec.price?.sale ?? null;
      const original = rec.price?.original ?? null;
      const price = sale ?? original;
      const priceRaw = price === null ? "" : String(price);
      attributes.priceVnd =
        typeof price === "number" && Number.isFinite(price) && price > 0
          ? observed(price)
          : absent<number>("missing");
      provenance.priceVnd = prov(
        category,
        index,
        "priceVnd",
        priceRaw,
        attributes.priceVnd,
        sale !== null ? "gia_khuyen_mai@v1" : "gia_goc@v1",
        sourceUrl
      );

      built.push({
        id: String(id),
        category,
        displayName,
        sourceUrl,
        attributes,
        provenance,
        observedAt: CATALOG_OBSERVED_AT,
      });
    });

    this.cache.set(category, built);
    return built;
  }

  async list(query: ProductQuery): Promise<Result<readonly SourcedProduct[]>> {
    const all = await this.all(query.category);
    return ok(query.limit ? all.slice(0, query.limit) : all);
  }

  async getById(id: string): Promise<Result<SourcedProduct | null>> {
    for (const rows of this.cache.values()) {
      const hit = rows.find((p) => p.id === id);
      if (hit) return ok(hit);
    }
    return ok(null);
  }
}
