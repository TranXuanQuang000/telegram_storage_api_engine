import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { DiscoverFilters } from "../../components/DiscoverFilters";
import { SiteHeader } from "../../components/SiteHeader";
import { StoryCard } from "../../components/StoryCard";
import { getFilteredDiscoverCatalog } from "../../lib/catalog";
import { getD1DiscoverCatalog } from "../../lib/d1-catalog";

export const metadata: Metadata = { title: "Khám phá", description: "Tìm truyện theo tên, thể loại, mood, trạng thái và nguồn." };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const include = Array.isArray(params.include) ? params.include : params.include ? [params.include] : [];
  const exclude = Array.isArray(params.exclude) ? params.exclude : params.exclude ? [params.exclude] : [];
  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const mood = typeof params.mood === "string" ? params.mood : "";
  const format = typeof params.format === "string" ? params.format : "";
  const pace = typeof params.pace === "string" ? params.pace : "";
  const minScore = typeof params.minScore === "string" ? Number(params.minScore) : 0;
  const maxChapters = typeof params.maxChapters === "string" ? Number(params.maxChapters) : 0;
  const sort = typeof params.sort === "string" ? params.sort : "latest";
  const filters = {
    query,
    page,
    include,
    exclude,
    status: typeof params.status === "string" ? params.status : undefined,
    mood,
    format,
    pace,
    minScore,
    maxChapters,
    sort,
  };
  const runtime = env as unknown as { DB?: D1Database };
  const indexedCatalog = runtime.DB
    ? await getD1DiscoverCatalog(runtime.DB, filters).catch(() => null)
    : null;
  const catalog = indexedCatalog ?? await getFilteredDiscoverCatalog(filters);

  function pageHref(nextPage: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
      else if (value) next.set(key, value);
    }
    if (nextPage > 1) next.set("page", String(nextPage)); else next.delete("page");
    return `/discover${next.size ? `?${next.toString()}` : ""}`;
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="discover-page page-shell">
        <header className="page-intro" data-code="SCAN">
          <p className="section-kicker">SIGNAL SCANNER / 26K+ STORIES</p>
          <h1>Khóa đúng<br /><em>tần số.</em></h1>
          <p>Trộn thể loại, mood, nhịp và điểm đánh giá thành một truy vấn duy nhất. Mực lọc toàn chỉ mục trước khi chia trang — không bỏ sót vì rơi nhầm trang nguồn.</p>
        </header>
        <div className="discover-layout">
          <DiscoverFilters key={JSON.stringify(params)} initialQuery={query} />
          <section className="discover-results" aria-live="polite">
            <div className="results-heading">
              <div><span>{catalog.totalItems}</span><p>{query ? `kết quả toàn chỉ mục cho “${query}”` : "truyện qua bộ lọc toàn chỉ mục"}</p></div>
              <Link href="/settings/ai"><Sparkles aria-hidden="true" /> Hỏi AI bằng lời tự nhiên</Link>
            </div>
            {catalog.searchNotice && !catalog.searchNotice.exactMatch ? (
              <aside className="search-correction" aria-live="polite">
                <div>
                  <strong>Không có truyện nào tên chính xác “{catalog.searchNotice.requestedQuery}”.</strong>
                  <p>Mực đang hiển thị các tên gần giống nhất — hãy chọn nếu đây là truyện bạn định tìm.</p>
                </div>
                {catalog.searchNotice.suggestions.length ? (
                  <div className="search-correction__suggestions" aria-label="Tên truyện gần giống">
                    {catalog.searchNotice.suggestions.map((suggestion) => (
                      <Link key={suggestion.slug} href={`/discover?q=${encodeURIComponent(suggestion.title)}&sort=relevance`}>
                        {suggestion.title}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </aside>
            ) : null}
            {catalog.stories.length ? (
              <div className="story-grid story-grid--results">{catalog.stories.map((story) => <StoryCard key={story.id} story={story} />)}</div>
            ) : (
              <div className="empty-state">
                <span>0</span>
                <h2>Chưa có truyện nào đi qua đủ bộ lọc.</h2>
                <p>Thử bỏ bớt một thể loại bắt buộc, hoặc tìm bằng alias tiếng Anh/romanized.</p>
                <Link className="button button--ink" href="/discover">Xóa bộ lọc <ArrowRight aria-hidden="true" /></Link>
              </div>
            )}
            {catalog.totalPages > 1 ? (
              <nav className="pagination" aria-label="Phân trang kết quả">
                {catalog.page > 1 ? <Link href={pageHref(catalog.page - 1)}>← Trang trước</Link> : <span />}
                <p>Trang <strong>{catalog.page}</strong> / {catalog.totalPages.toLocaleString("vi-VN")} · {catalog.sourceLabel}</p>
                {catalog.page < catalog.totalPages ? <Link href={pageHref(catalog.page + 1)}>Trang sau →</Link> : <span />}
              </nav>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
