import Link from "next/link";
import { BookOpen, BookText, Compass, Download, Library, Sparkles, Zap } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { HeaderSearch } from "./HeaderSearch";
import { UserMenu } from "./UserMenu";

export function SiteHeader() {
  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <BrandMark />
          <span className="site-status"><i /> LIVE CATALOG</span>
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            <Link href="/discover"><Compass aria-hidden="true" /><span>Truyện tranh</span></Link>
            <Link href="/novels"><BookText aria-hidden="true" /><span>Truyện chữ</span></Link>
            <Link href="/library"><Library aria-hidden="true" /><span>Tủ truyện</span></Link>
            <Link href="/downloads"><Download aria-hidden="true" /><span>Offline</span></Link>
          </nav>
          <HeaderSearch />
          <div className="flex items-center gap-4">
            <Link className="ai-pill" href="/settings/ai"><Zap aria-hidden="true" /> AI MODE <Sparkles aria-hidden="true" /></Link>
            <UserMenu />
          </div>
        </div>
      </header>
      <nav className="mobile-dock" aria-label="Điều hướng di động">
        <Link href="/"><BookOpen aria-hidden="true" /><span>Tranh</span></Link>
        <Link href="/novels"><BookText aria-hidden="true" /><span>Chữ</span></Link>
        <Link href="/library"><Library aria-hidden="true" /><span>Tủ</span></Link>
        <Link href="/downloads"><Download aria-hidden="true" /><span>Tải</span></Link>
        <Link href="/settings/ai"><Sparkles aria-hidden="true" /><span>AI</span></Link>
      </nav>
    </>
  );
}

