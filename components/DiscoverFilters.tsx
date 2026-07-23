"use client";

import { ArrowRight, Check, Minus, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const genres = [
  ["action", "Hành động"], ["fantasy", "Kỳ ảo"], ["romance", "Tình cảm"],
  ["drama", "Drama"], ["webtoon", "Webtoon"], ["manhwa", "Manhwa"],
  ["mystery", "Bí ẩn"], ["school-life", "Học đường"], ["slice-of-life", "Đời thường"],
  ["truyen-mau", "Truyện màu"], ["sports", "Thể thao"], ["horror", "Kinh dị"],
] as const;

const moods = [
  ["mood-intense", "Căng thẳng"],
  ["mood-dark", "U tối"],
  ["mood-healing", "Chữa lành"],
  ["mood-clever", "Đấu trí"],
] as const;

export function DiscoverFilters({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const current = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const include = new Set(current.getAll("include"));
  const exclude = new Set(current.getAll("exclude"));

  function navigate(next: URLSearchParams) {
    next.delete("page");
    const value = next.toString();
    startTransition(() => {
      router.replace(value ? `/discover?${value}` : "/discover", { scroll: false });
    });
  }

  function toggleGenre(slug: string) {
    const next = new URLSearchParams(current.toString());
    const hasInclude = include.has(slug);
    const hasExclude = exclude.has(slug);
    const nextInclude = next.getAll("include").filter((value) => value !== slug);
    const nextExclude = next.getAll("exclude").filter((value) => value !== slug);
    next.delete("include");
    next.delete("exclude");
    nextInclude.forEach((value) => next.append("include", value));
    nextExclude.forEach((value) => next.append("exclude", value));
    if (!hasInclude && !hasExclude) next.append("include", slug);
    else if (hasInclude) next.append("exclude", slug);
    navigate(next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(current.toString());
    if (query.trim()) next.set("q", query.trim());
    else next.delete("q");
    navigate(next);
  }

  function setValue(name: string, value: string) {
    const next = new URLSearchParams(current.toString());
    if (value) next.set(name, value); else next.delete(name);
    navigate(next);
  }

  return (
    <aside className={`filter-panel${isPending ? " is-pending" : ""}`} aria-label="Bộ lọc truyện" aria-busy={isPending}>
      <div className="filter-panel__title"><SlidersHorizontal aria-hidden="true" /><strong>Lọc sâu</strong><span>{isPending ? "đang cập nhật…" : "chạm 2 lần để loại trừ"}</span></div>
      <form className="discover-search" onSubmit={submit} role="search">
        <Search aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên truyện — gõ gần đúng cũng được" aria-label="Tên truyện cần tìm, có hỗ trợ sai chính tả" />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="Xóa từ khóa"><X aria-hidden="true" /></button> : null}
        <button className="discover-search__submit" type="submit" aria-label="Tìm truyện"><ArrowRight aria-hidden="true" /></button>
      </form>
      <div className="filter-group">
        <span className="filter-label">Thể loại & định dạng</span>
        <div className="filter-chips">
          {genres.map(([slug, label]) => {
            const state = include.has(slug) ? "include" : exclude.has(slug) ? "exclude" : "idle";
            return (
              <button key={slug} type="button" data-genre={slug} data-state={state} onClick={() => toggleGenre(slug)} aria-pressed={state !== "idle"}>
                {state === "include" ? <Check aria-hidden="true" /> : state === "exclude" ? <Minus aria-hidden="true" /> : null}
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Mood muốn đọc</span>
        <div className="filter-chips filter-chips--single">
          {moods.map(([slug, label]) => (
            <button key={slug} type="button" data-state={current.get("mood") === slug ? "include" : "idle"} onClick={() => setValue("mood", current.get("mood") === slug ? "" : slug)} aria-pressed={current.get("mood") === slug}>
              {current.get("mood") === slug ? <Check aria-hidden="true" /> : null}{label}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-selects">
        <label><span>Trạng thái</span><select data-filter="status" value={current.get("status") ?? ""} onChange={(event) => setValue("status", event.target.value)}><option value="">Tất cả</option><option value="ongoing">Đang ra</option><option value="completed">Hoàn thành</option></select></label>
        <label><span>Định dạng</span><select data-filter="format" value={current.get("format") ?? ""} onChange={(event) => setValue("format", event.target.value)}><option value="">Tất cả</option><option value="format-webtoon">Webtoon / Manhwa</option><option value="format-manga">Manga</option><option value="format-manhua">Manhua</option></select></label>
        <label><span>Nhịp truyện</span><select data-filter="pace" value={current.get("pace") ?? ""} onChange={(event) => setValue("pace", event.target.value)}><option value="">Mọi nhịp</option><option value="pace-fast">Nhanh, vào việc sớm</option></select></label>
        <label><span>Độ dài hiện có</span><select data-filter="max-chapters" value={current.get("maxChapters") ?? ""} onChange={(event) => setValue("maxChapters", event.target.value)}><option value="">Không giới hạn</option><option value="50">Dưới 50 chương</option><option value="100">Dưới 100 chương</option><option value="300">Dưới 300 chương</option></select></label>
        <label><span>Điểm tối thiểu</span><select data-filter="min-score" value={current.get("minScore") ?? ""} onChange={(event) => setValue("minScore", event.target.value)}><option value="">Không giới hạn</option><option value="3.5">3.5 sao</option><option value="4">4 sao</option><option value="4.25">4.25 sao</option></select></label>
        <label><span>Sắp xếp</span><select data-filter="sort" value={current.get("sort") ?? "latest"} onChange={(event) => setValue("sort", event.target.value)}><option value="latest">Mới cập nhật</option><option value="rating">Đánh giá cao nhất</option><option value="relevance">Tên phù hợp nhất</option><option value="shortest">Ít chương trước</option></select></label>
      </div>
      <div className="filter-legend"><span><Check aria-hidden="true" /> phải có</span><span><Minus aria-hidden="true" /> loại trừ</span></div>
    </aside>
  );
}
