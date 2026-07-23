import Link from "next/link";
import { BookOpen, Compass, Download, Library, Search, Sparkles } from "lucide-react";
import { BrandMark } from "./BrandMark";

export function SiteHeader() {
  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <BrandMark />
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            <Link href="/discover"><Compass aria-hidden="true" /> Khám phá</Link>
            <Link href="/library"><Library aria-hidden="true" /> Tủ truyện</Link>
            <Link href="/downloads"><Download aria-hidden="true" /> Đã tải</Link>
          </nav>
          <form className="header-search" action="/discover" role="search">
            <Search aria-hidden="true" />
            <input name="q" type="search" placeholder="Tên truyện, tác giả, hoặc một mood..." aria-label="Tìm truyện" />
            <kbd>/</kbd>
          </form>
          <Link className="ai-pill" href="/settings/ai"><Sparkles aria-hidden="true" /> AI của bạn</Link>
        </div>
      </header>
      <nav className="mobile-dock" aria-label="Điều hướng di động">
        <Link href="/"><BookOpen aria-hidden="true" /><span>Đọc</span></Link>
        <Link href="/discover"><Compass aria-hidden="true" /><span>Tìm</span></Link>
        <Link href="/library"><Library aria-hidden="true" /><span>Tủ</span></Link>
        <Link href="/downloads"><Download aria-hidden="true" /><span>Tải</span></Link>
      </nav>
    </>
  );
}

