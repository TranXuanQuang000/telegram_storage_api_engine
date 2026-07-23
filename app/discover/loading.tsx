import { SiteHeader } from "../../components/SiteHeader";

export default function DiscoverLoading() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="route-loading page-shell" aria-label="Đang tìm truyện">
        <div className="route-loading__headline" />
        <div className="route-loading__grid">
          <aside />
          <section>{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</section>
        </div>
      </main>
    </div>
  );
}
