/**
 * Khung nhìn SEARCH trên catalog đã chuẩn hoá của web — thay cho catalog.py của dmx_search.
 *
 * NormalizedProduct (lib/data/catalog.ts) giữ specs gốc trong `rawFields`; ở đây parse
 * chúng thành facet 3-trạng-thái (FacetValue) mà tầng chấm điểm cần. Field nào đọc
 * cho facet nào là do config ngành khai báo — không hardcode ngành:
 *   - fit       : cfg.fit.fields + đơn vị (m²/người/inch) quyết định parser
 *   - noise_db  : highlight có format "db"
 *   - energy    : highlight có format "stars"
 *   - features  : cfg.search.fields chứa tag tiện ích; các cột Inverter → inverter
 */

import type { NormalizedProduct } from "@/lib/types";
import type { CategoryConfig } from "@/lib/data/category-config";
import { isInverter, tagToConcepts } from "./concepts";
import {
  type FacetValue,
  MISSING,
  ok,
  parseAreaRange,
  parseEnergyLabel,
  parseNoise,
  parsePeopleRange,
  parseTags,
  value,
} from "./normalize";

export interface SearchProduct {
  p: NormalizedProduct;
  /** Khoảng hoàn cảnh của ngành (m²/người/inch) dạng 3-trạng-thái. */
  fit: FacetValue;
  noiseDb: FacetValue;
  energy: FacetValue;
  concepts: Set<string>;
  inverter: boolean;
}

const INVERTER_FIELDS = ["Công nghệ tiết kiệm điện", "Loại Inverter", "Inverter"];

function firstRaw(p: NormalizedProduct, fields: string[]): unknown {
  for (const f of fields) {
    const v = p.rawFields[f];
    if (typeof v === "string" && v.trim()) return v;
    if (v != null && typeof v !== "string") return v;
  }
  return null;
}

function parseFitFacet(p: NormalizedProduct, cfg: CategoryConfig): FacetValue {
  if (!cfg.fit) return MISSING;
  const raw = firstRaw(p, cfg.fit.fields);
  switch (cfg.fit.unit) {
    case "m²":
      return parseAreaRange(raw);
    case "người":
      return parsePeopleRange(raw);
    default: {
      // inch (tivi/laptop): web đã parse sẵn thành NumRange qua config parser.
      if (p.fit == null) return raw == null ? MISSING : value("unparsed", raw);
      return value("ok", p.fitRaw, { lo: p.fit.min, hi: p.fit.max ?? p.fit.min, num: p.fit.min });
    }
  }
}

function facetByFormat(p: NormalizedProduct, cfg: CategoryConfig, format: string): FacetValue {
  const fields = cfg.highlights.filter((h) => h.format === format).flatMap((h) => h.fields);
  if (!fields.length) return MISSING;
  const raw = firstRaw(p, fields);
  return format === "db" ? parseNoise(raw) : parseEnergyLabel(raw);
}

/** Dựng khung nhìn search cho một sản phẩm. Thuần hàm, tất định. */
export function toSearchProduct(p: NormalizedProduct, cfg: CategoryConfig): SearchProduct {
  const tags: string[] = [];
  for (const f of cfg.search?.fields ?? []) {
    if (INVERTER_FIELDS.includes(f)) continue;
    const t = parseTags(p.rawFields[f]);
    tags.push(...t.tags);
  }

  const concepts = new Set<string>();
  for (const t of tags) for (const c of tagToConcepts(t)) concepts.add(c);

  const inverter = isInverter(firstRaw(p, INVERTER_FIELDS));
  if (inverter) concepts.add("inverter");

  return {
    p,
    fit: parseFitFacet(p, cfg),
    noiseDb: facetByFormat(p, cfg, "db"),
    energy: facetByFormat(p, cfg, "stars"),
    concepts,
    inverter,
  };
}

export function buildView(products: NormalizedProduct[], cfg: CategoryConfig): SearchProduct[] {
  return products.map((p) => toSearchProduct(p, cfg));
}

export { ok as facetOk };
