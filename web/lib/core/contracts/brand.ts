/**
 * Nhãn kiểu (branding) — công cụ để CƯỠNG CHẾ THỨ TỰ trong mã (#24, "Hoàn thành khi").
 *
 * Một giá trị mang nhãn chỉ được tạo bởi đúng một hàm. Hàm ở bước sau khai báo
 * tham số là kiểu đã mang nhãn của bước trước, nên gọi sai thứ tự sẽ KHÔNG BIÊN
 * DỊCH ĐƯỢC — thay vì phải nhớ quy ước hay chờ kiểm thử phát hiện.
 *
 * Chuỗi bắt buộc:
 *   screen → rank → verify → save → present
 */

declare const brandKey: unique symbol;

/** Gắn nhãn `B` lên kiểu `T`. Nhãn chỉ tồn tại lúc biên dịch, không có ở runtime. */
export type Brand<T, B extends string> = T & { readonly [brandKey]: B };
