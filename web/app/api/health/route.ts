import { CATEGORIES } from "@/lib/data/category-config";
import { LLM_CONFIG, probeLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trạng thái hệ thống — báo trung thực có/không có LLM và đang phục vụ những ngành nào. */
export async function GET() {
  const llm = await probeLLM();
  return Response.json({
    llm,
    model: LLM_CONFIG.model,
    categories: CATEGORIES.map((c) => ({
      slug: c.slug,
      label: c.label,
      emoji: c.emoji,
    })),
  });
}
