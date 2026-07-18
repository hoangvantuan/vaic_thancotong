// ĐIỂM LẮP RÁP — nơi DUY NHẤT quyết định dùng bản hiện thực nào cho ba điểm kết nối.
//
// Mọi chỗ khác chỉ nhận `ProductSource`, `ModelService`, `SessionStore` qua tham số.
// Nhờ vậy đổi bản lưu trữ hay đổi nhà cung cấp mô hình chỉ sửa đúng tệp này.
//
// Phiếu #25 thay `MockProductSource` bằng bản đọc dữ liệu thật.
// Phiếu #27 thay `MockModelService` bằng bản gọi mô hình thật.
// Phiếu #29 thay `MemorySessionStore` bằng bản lưu xuống đĩa.

import type { ProductSource } from "./ports/product-source";
import type { ModelService } from "./ports/model-service";
import type { SessionStore } from "./ports/session-store";
import { MockProductSource } from "./adapters/mock-product-source";
import { MockModelService } from "./adapters/mock-model-service";
import { MemorySessionStore } from "./adapters/memory-session-store";
import { MultiCatalogSource } from "./adapters/multi-catalog-source";
import { LlmModelService } from "./adapters/llm-model-service";

export interface CoreServices {
  products: ProductSource;
  model: ModelService;
  store: SessionStore;
  /** Bản phát hành tư vấn đang phục vụ, ghi vào mọi ảnh chụp quyết định. */
  releaseVersion: string;
}

/**
 * Bản lưu trữ phải là MỘT thể dùng chung cho cả tiến trình — nếu mỗi yêu cầu tạo
 * một `MemorySessionStore` mới thì phiên tạo ở yêu cầu này sẽ biến mất ở yêu cầu sau.
 */
let sharedStore: SessionStore | null = null;

function getStore(): SessionStore {
  sharedStore ??= new MemorySessionStore();
  return sharedStore;
}

/** Bộ dịch vụ cho môi trường chạy thật. */
export function createCoreServices(): CoreServices {
  return {
    // ĐA NGÀNH: máy lạnh dùng dữ liệu đã nạp kèm nguồn chứng minh (#25); các ngành
    // khác đọc data/{slug}.json theo registry — thêm ngành không phải sửa logic.
    products: new MultiCatalogSource(),
    // Hiểu câu bằng bộ trích xuất tất định + LLM (#27). Không có LLM vẫn chạy.
    model: new LlmModelService(),
    store: getStore(),
    releaseVersion: process.env.RELEASE_VERSION ?? "demo@v0",
  };
}

/** Bộ dịch vụ cho kiểm thử — luôn sạch, không dùng chung trạng thái giữa các ca. */
export function createTestServices(overrides: Partial<CoreServices> = {}): CoreServices {
  return {
    products: new MockProductSource(),
    model: new MockModelService(),
    store: new MemorySessionStore(),
    releaseVersion: "test@v0",
    ...overrides,
  };
}
