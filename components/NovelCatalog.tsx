"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BookText, LibraryBig, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { NovelSummary } from "../lib/novels";
import { StoryCover } from "./StoryCover";

type CatalogPayload = {
  items: NovelSummary[];
  page: number;
  totalItems: number;
  totalPages: number;
  sourceLabel: string;
};

export function NovelCatalog({ initialNovels, initialQuery = "" }: { initialNovels: NovelSummary[]; initialQuery?: string }) {
  const [payload, setPayload] = useState<CatalogPayload>({
    items: initialNovels,
    page: 1,
    totalItems: initialNovels.length,
    totalPages: 1,
    sourceLabel: "Tác phẩm đóng gói sẵn",
  });
  const [query, setQuery] = useState(initialQuery);
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState("updated");
  const [loading, setLoading] = useState(true);

  function load(page = 1, signal?: AbortSignal) {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "24",
      sort,
      catalogVersion: "2",
    });
    if (query.trim()) params.set("q", query.trim());
    if (genre) params.set("genre", genre);
    return fetch(`/api/novels?${params.toString()}`, {
      signal,
      cache: "no-store",
    })
      .then(async (response) => response.ok ? await response.json() as CatalogPayload : null)
      .then((next) => { if (next) setPayload(next); })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(1, controller.signal).catch(() => undefined));
    return () => controller.abort();
    // Initial catalog expansion intentionally runs once after first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void load(1).catch(() => undefined);
  }

  return (
    <section className="novel-catalog" aria-labelledby="novel-catalog-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker"><LibraryBig aria-hidden="true" /> TỦ CHỮ CÔNG CỘNG</p>
          <h2 id="novel-catalog-title">Tác phẩm có thể mở ngay.</h2>
        </div>
        <span className="novel-catalog__count">{payload.totalItems.toLocaleString("vi-VN")} tác phẩm · {payload.sourceLabel}</span>
      </div>
      <form className="novel-catalog__filters" onSubmit={submit} role="search">
        <label>
          <Search aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tác phẩm, tác giả hoặc dịch giả…" />
        </label>
        <select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Lọc loại truyện chữ">
          <option value="">Mọi loại tác phẩm</option>
          <option value="Tiểu thuyết">Tiểu thuyết</option>
          <option value="Truyện ngắn">Truyện ngắn</option>
          <option value="Văn học Việt Nam">Văn học Việt Nam</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sắp xếp truyện chữ">
          <option value="updated">Mới cập nhật</option>
          <option value="title">Tên A–Z</option>
          <option value="chapters">Nhiều phần trước</option>
        </select>
        <button className="button button--ink" type="submit" disabled={loading}><Search aria-hidden="true" /> {loading ? "Đang tải…" : "Tìm truyện chữ"}</button>
      </form>
      {payload.items.length ? (
        <div className="novel-grid" aria-busy={loading}>
          {payload.items.map((novel, index) => (
            <article key={novel.slug} className="novel-card" style={{ "--novel-accent": novel.accent } as React.CSSProperties}>
              <Link className="novel-card__cover" href={`/novels/${novel.slug}`}>
                {novel.coverUrl ? (
                  <div className="novel-card__art">
                    <StoryCover src={novel.coverUrl} title={novel.title} />
                  </div>
                ) : null}
                <span>{String((payload.page - 1) * 24 + index + 1).padStart(2, "0")}</span>
                <BookText aria-hidden="true" />
                <strong>{novel.title}</strong>
                <small>{novel.author}</small>
              </Link>
              <div>
                <p>{novel.description}</p>
                <div>
                  {novel.genres.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
                  <span>{(novel.chapterCount ?? novel.chapters.length) > 0 ? `${novel.chapterCount ?? novel.chapters.length} phần` : "Mở để tải mục lục"}</span>
                </div>
                <Link href={`/novels/${novel.slug}`}>Mở tác phẩm <ArrowRight aria-hidden="true" /></Link>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-state"><h2>Chưa tìm thấy tác phẩm phù hợp.</h2><p>Thử bỏ bộ lọc thể loại hoặc tìm bằng tên tác giả.</p></div>}
      {payload.totalPages > 1 ? (
        <nav className="novel-catalog__pagination" aria-label="Phân trang truyện chữ">
          <button type="button" onClick={() => void load(payload.page - 1)} disabled={loading || payload.page <= 1}><ArrowLeft aria-hidden="true" /> Trang trước</button>
          <span>Trang {payload.page}/{payload.totalPages}</span>
          <button type="button" onClick={() => void load(payload.page + 1)} disabled={loading || payload.page >= payload.totalPages}>Trang sau <ArrowRight aria-hidden="true" /></button>
        </nav>
      ) : null}
    </section>
  );
}
