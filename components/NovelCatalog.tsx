"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Clock3,
  Flame,
  LibraryBig,
  Search,
  Sparkles,
} from "lucide-react";
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

function chapterLabel(novel: NovelSummary) {
  const count = novel.chapterCount ?? novel.chapters.length;
  return count > 0 ? `${count.toLocaleString("vi-VN")} chương` : "Đang nạp mục lục";
}

function initials(title: string) {
  return title.split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}

export function NovelCatalog({ initialNovels, initialQuery = "" }: { initialNovels: NovelSummary[]; initialQuery?: string }) {
  const [payload, setPayload] = useState<CatalogPayload>({
    items: initialNovels,
    page: 1,
    totalItems: initialNovels.length,
    totalPages: 1,
    sourceLabel: "Tác phẩm mở sẵn",
  });
  const [query, setQuery] = useState(initialQuery);
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState("hot");
  const [loading, setLoading] = useState(true);

  function load(page = 1, signal?: AbortSignal) {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "24",
      sort,
      catalogVersion: "3",
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
    // Expand the server-rendered starter shelf once after first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void load(1).catch(() => undefined);
  }

  return (
    <section className="novel-catalog" aria-labelledby="novel-catalog-title">
      <div className="section-heading novel-catalog__heading">
        <div>
          <p className="section-kicker"><LibraryBig aria-hidden="true" /> NOVEL INDEX / LIVE</p>
          <h2 id="novel-catalog-title">Tủ chữ đang phát sóng.</h2>
        </div>
        <div className="novel-catalog__summary">
          <strong>{payload.totalItems.toLocaleString("vi-VN")}</strong>
          <span>tác phẩm đã lập chỉ mục</span>
          <small>{payload.sourceLabel}</small>
        </div>
      </div>

      <form className="novel-catalog__filters" onSubmit={submit} role="search">
        <label className="novel-catalog__search">
          <Search aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên truyện, tác giả, dịch giả…" />
        </label>
        <select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Lọc thể loại truyện chữ">
          <option value="">Mọi thể loại</option>
          <option value="Light Novel">Light novel</option>
          <option value="Tiên Hiệp">Tiên hiệp</option>
          <option value="Huyền Huyễn">Huyền huyễn</option>
          <option value="Ngôn Tình">Ngôn tình</option>
          <option value="Tiểu thuyết">Tiểu thuyết</option>
          <option value="Truyện ngắn">Truyện ngắn</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sắp xếp truyện chữ">
          <option value="hot">Đang hot</option>
          <option value="updated">Mới cập nhật</option>
          <option value="chapters">Nhiều chương</option>
          <option value="title">Tên A–Z</option>
        </select>
        <button className="button button--ink" type="submit" disabled={loading}>
          <Search aria-hidden="true" /> {loading ? "Đang dò sóng…" : "Tìm trong tủ"}
        </button>
      </form>

      <div className="novel-catalog__mode" aria-live="polite">
        {sort === "hot" ? <><Flame aria-hidden="true" /> Ưu tiên truyện nhiều chương, metadata đầy đủ, có bìa và vừa cập nhật.</> : null}
        {sort === "updated" ? <><Clock3 aria-hidden="true" /> Đang xếp theo thời điểm nguồn cập nhật gần nhất.</> : null}
        {sort === "chapters" ? <><BookOpenText aria-hidden="true" /> Đang xếp các bộ có mục lục dài lên trước.</> : null}
        {sort === "title" ? <><Sparkles aria-hidden="true" /> Đang xếp theo tên tiếng Việt.</> : null}
      </div>

      {payload.items.length ? (
        <div className={`novel-grid${loading ? " is-loading" : ""}`} aria-busy={loading}>
          {payload.items.map((novel, index) => (
            <article key={novel.slug} className="novel-card" style={{ "--novel-accent": novel.accent } as React.CSSProperties}>
              <Link className="novel-card__cover" href={`/novels/${novel.slug}`} aria-label={`Mở ${novel.title}`}>
                {novel.coverUrl ? (
                  <div className="novel-card__art">
                    <StoryCover src={novel.coverUrl} title={novel.title} />
                  </div>
                ) : (
                  <div className="novel-card__fallback">
                    <BookOpenText aria-hidden="true" />
                    <strong>{initials(novel.title)}</strong>
                  </div>
                )}
                <span className="novel-card__rank">{String((payload.page - 1) * 24 + index + 1).padStart(2, "0")}</span>
                <span className="novel-card__source">{novel.sourceName ?? "Mực Chữ"}</span>
                <span className="novel-card__open">Mở tác phẩm <ArrowRight aria-hidden="true" /></span>
              </Link>
              <div className="novel-card__body">
                <div className="novel-card__title">
                  <h3><Link href={`/novels/${novel.slug}`}>{novel.title}</Link></h3>
                  <p>{novel.author}</p>
                </div>
                <p className="novel-card__description">{novel.description}</p>
                <div className="novel-card__tags">
                  {novel.genres.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
                </div>
                <div className="novel-card__footer">
                  <span><BookOpenText aria-hidden="true" /> {chapterLabel(novel)}</span>
                  <Link href={`/novels/${novel.slug}`}>Chi tiết <ArrowRight aria-hidden="true" /></Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpenText aria-hidden="true" />
          <h2>Chưa tìm thấy tác phẩm phù hợp.</h2>
          <p>Thử bỏ bớt bộ lọc hoặc tìm bằng một phần tên tác giả.</p>
        </div>
      )}

      {payload.totalPages > 1 ? (
        <nav className="novel-catalog__pagination" aria-label="Phân trang truyện chữ">
          <button type="button" onClick={() => void load(payload.page - 1)} disabled={loading || payload.page <= 1}><ArrowLeft aria-hidden="true" /> Trang trước</button>
          <span>Trang <strong>{payload.page}</strong> / {payload.totalPages}</span>
          <button type="button" onClick={() => void load(payload.page + 1)} disabled={loading || payload.page >= payload.totalPages}>Trang sau <ArrowRight aria-hidden="true" /></button>
        </nav>
      ) : null}
    </section>
  );
}
