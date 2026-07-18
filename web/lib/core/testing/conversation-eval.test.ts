// VÒNG TỰ CẢI TIẾN — chạy pipeline THẬT + LLM THẬT trên kịch bản đời thường, rồi
// LLM-JUDGE tự chấm + rút BÀI HỌC (proposed) ghi vào kho. Đây là "nhân viên làm ca,
// quản lý chấm, rút kinh nghiệm cho ca sau". KHÔNG chạy trong `npm run test` thường.
//
//   RUN_EVAL=1 npx vitest run lib/core/testing/conversation-eval.test.ts
//
import { describe, it } from "vitest";
import pkg from "@next/env";
import { readFileSync, writeFileSync } from "node:fs";

const RUN = !!process.env.RUN_EVAL;

const SCENARIOS: { name: string; turns: string[] }[] = [
  { name: "Nóng - ủy thác - đổi ý quạt - diện tích (tái hiện ảnh)", turns: ["nong qua cuu toi", "toi ko biet nua", "quat dieu hoa", "khoang 10m2"] },
  { name: "Nóng - ủy thác - diện tích - ngân sách", turns: ["trời nóng quá", "không biết nữa, tư vấn giúp mình đi", "phòng 18m2", "tầm 12 triệu"] },
  { name: "Hỏi bảo hành (chính sách kèm tên ngành)", turns: ["máy lạnh bảo hành mấy năm vậy shop"] },
  { name: "TỦ LẠNH nhà đông người (đa ngành)", turns: ["nhà 5 người mua tủ lạnh loại nào", "tầm 15 triệu"] },
  { name: "MÁY GIẶT (đa ngành)", turns: ["máy giặt cho nhà 4 người, dưới 10 triệu"] },
  { name: "TIVI theo inch (đa ngành)", turns: ["mua tivi 55 inch tầm 12 triệu"] },
  { name: "Quạt - ngoài registry, phải từ chối khéo", turns: ["mua quạt điều hòa"] },
  { name: "Ngoài phạm vi", turns: ["mấy giờ cửa hàng đóng cửa vậy"] },
];

function render(result: any): string {
  if (!result) return "(lỗi: không có kết quả)";
  if (result.kind === "ask_one_question") return result.question;
  if (result.kind === "decline") return `[từ chối:${result.reason}] ${result.whatWouldHelp}`;
  if (result.kind === "recommend") {
    const lines = result.recommendations.map((r: any, i: number) => {
      const reasons = r.reasons.map((c: any) => c.claim).join(" | ");
      return `   ${i + 1}. ${r.displayName} — ${reasons}`;
    });
    const cav = result.caveats?.length ? `\n   ⚠ ${result.caveats.join(" ")}` : "";
    return `[gợi ý ${result.recommendations.length}]\n${lines.join("\n")}${cav}`;
  }
  return JSON.stringify(result);
}

describe.skipIf(!RUN)("VÒNG TỰ CẢI TIẾN (LLM thật + judge)", () => {
  it("chạy kịch bản → judge chấm → rút bài học", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    pkg.loadEnvConfig(process.cwd(), true);
    const { runTurn } = await import("@/lib/core/pipeline/run-turn");
    const { TURN_RULES_REGISTRY } = await import("@/lib/core/rules");
    const { createCoreServices } = await import("@/lib/core/composition");
    const { newTurnId } = await import("@/lib/core/contracts/ids");
    const { judgeConversation } = await import("@/lib/core/testing/conversation-judge");

    const out: string[] = [];
    const scores: number[] = [];
    const proposed: { scope: string; trigger: string; mistake: string; lesson: string }[] = [];
    const services = createCoreServices();
    out.push(`# VÒNG TỰ CẢI TIẾN — model ready: ${await services.model.isReady()}\n`);

    for (const sc of SCENARIOS) {
      out.push(`\n## ${sc.name}`);
      const created = await services.store.createSession();
      if (!created.ok) { out.push("  (không tạo được phiên)"); continue; }
      const { session, secret } = created.data;
      const transcript: { user: string; bot: string }[] = [];
      for (const userText of sc.turns) {
        const res = await runTurn(
          { sessionId: session.sessionId, turnId: newTurnId(), userText, receivedAt: new Date().toISOString() },
          secret, services, TURN_RULES_REGISTRY
        );
        const bot = res.ok ? render(res.data.result) : `(lỗi: ${res.error.message})`;
        out.push(`KHÁCH: ${userText}`);
        out.push(`BOT (ngành=${res.ok ? res.data.establishedCategory ?? "—" : "?"}): ${bot}`);
        transcript.push({ user: userText, bot });
      }
      const v = await judgeConversation(sc.name, transcript);
      scores.push(v.score);
      out.push(`⭐ JUDGE: ${v.score}/10`);
      for (const iss of v.issues) out.push(`   ✗ ${iss}`);
      for (const l of v.lessons) { out.push(`   💡 [${l.scope}] ${l.lesson}`); proposed.push(l); }
    }

    const avg = scores.filter((s) => s >= 0);
    out.unshift(`# ĐIỂM TRUNG BÌNH: ${avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : "?"}/10 (${SCENARIOS.length} kịch bản)`);

    // Ghi BÀI HỌC MỚI (proposed) vào kho — dedupe theo (scope+lesson).
    if (proposed.length) {
      const path = `${process.cwd()}/data/learnings.json`;
      const lf = JSON.parse(readFileSync(path, "utf8"));
      const seen = new Set(lf.lessons.map((l: any) => `${l.scope}|${l.lesson}`));
      let n = lf.lessons.length;
      let added = 0;
      for (const p of proposed) {
        const key = `${p.scope}|${p.lesson}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lf.lessons.push({ id: `P${++n}`, scope: p.scope, trigger: p.trigger, mistake: p.mistake, lesson: p.lesson, status: "proposed", createdAt: "2026-07-18" });
        added++;
      }
      writeFileSync(path, JSON.stringify(lf, null, 2), "utf8");
      out.push(`\n>>> Đã ghi ${added} bài học MỚI (proposed) vào data/learnings.json — chờ duyệt để nạp vào prompt.`);
    }

    writeFileSync(
      "/private/tmp/claude-502/-Users-user-Documents-AnhDD-Me-Projects-anhdd-workspace/4c71cd1b-c742-4959-b277-88d2d1fb40da/scratchpad/eval-out.md",
      out.join("\n"), "utf8"
    );
  }, 600000);
});
