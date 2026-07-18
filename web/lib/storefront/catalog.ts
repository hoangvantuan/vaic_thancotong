// Nạp một ÍT sản phẩm thật (từ data crawl có sẵn trong kho) để dựng NỀN storefront.
//
// ⚠️ Chỉ để TRƯNG BÀY: dữ liệu ở đây là cosmetic cho nền cửa hàng, KHÔNG đi qua đường
// có-căn-cứ của trợ lý (#25 + provenance). Trợ lý chỉ tin dữ liệu đã qua cổng lõi.

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface Tile {
  id: string;
  name: string;
  brand: string;
  priceSale: number | null;
  priceOriginal: number | null;
  image: string | null;
  categoryLabel: string;
  seed: string;
}

export interface Section {
  slug: string;
  label: string;
  tiles: Tile[];
}

export interface Showcase {
  categories: { slug: string; label: string }[];
  sections: Section[];
}

interface RawProduct {
  product_id: string;
  name: string;
  brand: string;
  price?: { original?: number | null; sale?: number | null } | null;
  image_url?: string | null;
}

const CATS: [string, string][] = [
  ["may_lanh", "Máy lạnh"],
  ["tu_lanh", "Tủ lạnh"],
  ["may_giat", "Máy giặt"],
  ["tivi", "Tivi"],
  ["laptop", "Laptop"],
  ["dien_thoai", "Điện thoại"],
];

export async function loadShowcase(): Promise<Showcase> {
  const categories = CATS.map(([slug, label]) => ({ slug, label }));
  const sections: Section[] = [];

  for (const [slug, label] of CATS) {
    let tiles: Tile[] = [];
    try {
      const raw = await readFile(path.join(process.cwd(), "data", `${slug}.json`), "utf8");
      const arr = JSON.parse(raw) as RawProduct[];
      tiles = arr
        .filter((p) => p.image_url && (p.price?.sale || p.price?.original))
        .slice(0, 6)
        .map((p) => ({
          id: p.product_id,
          name: p.name,
          brand: p.brand,
          priceSale: p.price?.sale ?? p.price?.original ?? null,
          priceOriginal: p.price?.original ?? null,
          image: p.image_url ?? null,
          categoryLabel: label,
          seed: `Tôi đang xem “${p.name}”, anh/chị tư vấn giúp mình với ạ`,
        }));
    } catch {
      tiles = [];
    }
    sections.push({ slug, label, tiles });
  }

  return { categories, sections };
}
