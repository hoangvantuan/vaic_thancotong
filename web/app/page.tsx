// Trang trình diễn #28: NỀN storefront (chỉ giao diện) + TRỢ LÝ docked (nơi có toàn
// bộ UX thật). Nền là Server Component đọc data crawl; trợ lý là Client Component.

import { Assistant } from "@/components/assistant/assistant";
import { Storefront } from "@/components/storefront/storefront";
import { loadShowcase } from "@/lib/storefront/catalog";

export default async function Page() {
  const showcase = await loadShowcase();
  return (
    <>
      <Storefront showcase={showcase} />
      <Assistant />
    </>
  );
}
