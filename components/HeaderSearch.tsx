"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

export function HeaderSearch() {
  const pathname = usePathname();
  const novels = pathname.startsWith("/novels");
  return (
    <form className="header-search" action={novels ? "/novels" : "/discover"} role="search">
      <Search aria-hidden="true" />
      <input name="q" type="search" placeholder={novels ? "Tìm tác phẩm hoặc tác giả…" : "Gõ tên truyện hoặc mood…"} aria-label={novels ? "Tìm truyện chữ" : "Tìm truyện tranh"} />
      <kbd>/</kbd>
    </form>
  );
}
