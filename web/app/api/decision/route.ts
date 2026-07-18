// Đọc lại ảnh chụp quyết định của MỘT lượt — nguồn dữ liệu cho màn "lý do quyết định".
//
// Tầng giao diện chỉ hiển thị thứ ĐÃ lưu (kien-truc.md: "Giao diện — hiển thị thứ ĐÃ
// lưu"). Bản ghi quyết định được lưu TRƯỚC khi trả kết quả lượt, nên khi người kiểm
// tra mở bảng lý do, tuyến này đọc đúng bản ghi bất biến ấy — không tính lại gì.
//
// Cùng luật sở hữu như mọi tuyến chạm phiên: phải có CẢ mã truy cập chung LẪN mã bí
// mật phiên. Biết mỗi mã lượt là không đủ để đọc (#24 mục 9). Không có bản ghi khớp
// thì trả `not_found` — giống nhau cho "chưa từng có" và "không thuộc phiên của bạn".

import { createCoreServices } from "@/lib/core/composition";
import { parseTurnId } from "@/lib/core/contracts/ids";
import { coreError } from "@/lib/core/contracts/status";
import { errorResponse, isCoreError, readSessionSecret } from "@/lib/core/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = readSessionSecret(req);
  if (isCoreError(secret)) return errorResponse(secret);

  const rawTurnId = new URL(req.url).searchParams.get("turnId") ?? "";
  const turnId = parseTurnId(rawTurnId);
  if (!turnId) {
    return errorResponse(coreError("invalid_input", "Thiếu hoặc sai turnId", "api/decision"));
  }

  const { store } = createCoreServices();
  const found = await store.getDecision(turnId, secret);
  if (!found.ok) return errorResponse(found.error);
  if (!found.data) {
    return errorResponse(coreError("not_found", "Không có bản ghi quyết định cho lượt này", "api/decision"));
  }

  // Trả nguyên ảnh chụp quyết định bất biến để màn lý do đọc: dữ kiện đầu vào, kết
  // quả lọc (sản phẩm bị loại kèm lý do), thứ hạng, kiểm tra công bố và kết quả đã trả.
  return Response.json({ decision: found.data });
}
