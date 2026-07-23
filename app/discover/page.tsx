import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { DiscoverFilters } from "../../components/DiscoverFilters";
import { SiteHeader } from "../../components/SiteHeader";
import { StoryCard } from "../../components/StoryCard";
import { getDiscoverCatalog } from "../../lib/catalog";
import { titleSimilarity } from "../../lib/search-utils";

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
  const catalog = await getDiscoverCatalog({
    query,
    page,
    primaryGenre: include[0],
    status: typeof params.status === "string" ? params.status : undefined,
    enrichRatings: sort === "rating" || minScore > 0,
  });
  const filtered = catalog.stories.filter((story) => {
    const tags = new Set([...story.genreSlugs, ...story.discoveryTags]);
    const includeOkay = include.length === 0 || include.every((slug) => tags.has(slug));
    const excludeOkay = exclude.every((slug) => !tags.has(slug));
    const statusOkay = !params.status || story.status === params.status;
    const moodOkay = !mood || tags.has(mood);
    const formatOkay = !format || tags.has(format);
    const paceOkay = !pace || tags.has(pace);
    const scoreOkay = !minScore || (story.score !== null && story.score >= minScore);
    const chapterCount = Number.parseFloat(story.latestChapter ?? "0");
    const lengthOkay = !maxChapters || (Number.isFinite(chapterCount) && chapterCount <= maxChapters);
    return includeOkay && excludeOkay && statusOkay && moodOkay && formatOkay && paceOkay && scoreOkay && lengthOkay;
  }).sort((left, right) => {
    if (sort === "rating") return (right.score ?? -1) - (left.score ?? -1);
    if (sort === "relevance" && query) {
      const rightSimilarity = Math.max(titleSimilarity(query, right.title), right.originTitle ? titleSimilarity(query, right.originTitle) : 0);
      const leftSimilarity = Math.max(titleSimilarity(query, left.title), left.originTitle ? titleSimilarity(query, left.originTitle) : 0);
      return rightSimilarity - leftSimilarity;
    }
    if (sort === "shortest") return Number.parseFloat(left.latestChapter ?? "999999") - Number.parseFloat(right.latestChapter ?? "999999");
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

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
        <header className="page-intro">
          <p className="section-kicker">Bàn tra cứu</p>
          <h1>Tìm đúng gu,<br /><em>không mò cả tối.</em></h1>
          <p>Chọn một lần để bắt buộc có, chọn lần hai để loại trừ. Mỗi bộ lọc đều nằm trong URL để bạn lưu hoặc gửi cho bạn bè.</p>
        </header>
        <div className="discover-layout">
          <DiscoverFilters initialQuery={query} />
          <section className="discover-results" aria-live="polite">
            <div className="results-heading">
              <div><span>{filtered.length}</span><p>{query ? `kết quả ở trang này cho “${query}”` : `truyện qua bộ lọc · ${catalog.totalItems.toLocaleString("vi-VN")} từ nguồn`}</p></div>
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
            {filtered.length ? (
              <div className="story-grid story-grid--results">{filtered.map((story) => <StoryCard key={story.id} story={story} />)}</div>
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
