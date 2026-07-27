import Link from "next/link";
import { BookOpen, BookText, Compass, Library, Sparkles, Zap, Layers, Activity, Feather } from "lucide-react";
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
            <Link href="/discover"><Compass aria-hidden="true" /><span>Khám phá</span></Link>
            <Link href="/novels"><BookText aria-hidden="true" /><span>Truyện chữ</span></Link>
            <Link href="/journal"><Feather aria-hidden="true" /><span>Journal</span></Link>
            <Link href="/admin/canvas"><Layers aria-hidden="true" /><span>Canvas</span></Link>
            <Link href="/admin/cyber-nexus"><Activity aria-hidden="true" /><span>Nexus HUD</span></Link>
            <Link href="/library"><Library aria-hidden="true" /><span>Tủ truyện</span></Link>
          </nav>
          <HeaderSearch />
          <div className="flex items-center gap-3">
            <Link className="ai-pill" href="/settings/ai"><Zap aria-hidden="true" /> AI MODE <Sparkles aria-hidden="true" /></Link>
            <UserMenu />
          </div>
        </div>
      </header>
      <nav className="mobile-dock" aria-label="Điều hướng di động">
        <Link href="/"><BookOpen aria-hidden="true" /><span>Tranh</span></Link>
        <Link href="/novels"><BookText aria-hidden="true" /><span>Chữ</span></Link>
        <Link href="/journal"><Feather aria-hidden="true" /><span>Journal</span></Link>
        <Link href="/admin/canvas"><Layers aria-hidden="true" /><span>Canvas</span></Link>
        <Link href="/admin/cyber-nexus"><Activity aria-hidden="true" /><span>Nexus</span></Link>
      </nav>
    </>
  );
}
