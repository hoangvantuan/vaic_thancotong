// Tạo và xoá phiên tư vấn.
//
// POST   → tạo phiên mới, trả về mã phiên VÀ mã bí mật (lần duy nhất mã bí mật
//          xuất hiện dạng rõ — trình duyệt phải tự giữ).
// DELETE → khách xoá phiên của chính mình.
//
// Không có GET liệt kê phiên: theo #24 mục 9, không có chức năng liệt kê phiên
// của người khác.

import { createCoreServices } from "@/lib/core/composition";
import { parseSessionId } from "@/lib/core/contracts/ids";
import { errorResponse, isCoreError, readSessionSecret } from "@/lib/core/http";
import { coreError } from "@/lib/core/contracts/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { store } = createCoreServices();
  const created = await store.createSession();
  if (!created.ok) return errorResponse(created.error);

  return Response.json(
    {
      sessionId: created.data.session.sessionId,
      // Giữ lấy: mọi thao tác sau này đều cần, và máy chủ chỉ lưu bản băm.
      sessionSecret: created.data.secret,
      createdAt: created.data.session.createdAt,
    },
    { status: 201 }
  );
}

export async function DELETE(req: Request) {
  const secret = readSessionSecret(req);
  if (isCoreError(secret)) return errorResponse(secret);

  const rawId = new URL(req.url).searchParams.get("sessionId") ?? "";
  const sessionId = parseSessionId(rawId);
  if (!sessionId) {
    return errorResponse(coreError("invalid_input", "Thiếu hoặc sai sessionId", "api/session"));
  }

  const { store } = createCoreServices();
  const deleted = await store.deleteSession(sessionId, secret);
  if (!deleted.ok) return errorResponse(deleted.error);

  return new Response(null, { status: 204 });
}
