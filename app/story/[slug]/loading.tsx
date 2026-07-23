import { SiteHeader } from "../../../components/SiteHeader";

export default function StoryLoading() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="route-loading route-loading--story page-shell" aria-label="Đang mở truyện">
        <div className="route-loading__cover" />
        <div><span /><span /><span /><span /></div>
      </main>
    </div>
  );
}
