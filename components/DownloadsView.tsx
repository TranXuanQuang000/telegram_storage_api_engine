"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, DownloadCloud, HardDrive, Pin, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { listDownloads, migrateLegacyDownloads, removeChapterOffline, storageEstimate, type DownloadRecord } from "../lib/offline-store";

export function DownloadsView() {
  const [items, setItems] = useState<DownloadRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });

  useEffect(() => {
    let active = true;
    Promise.all([migrateLegacyDownloads().then(listDownloads), storageEstimate()])
      .then(([downloads, estimate]) => { if (active) { setItems(downloads); setStorage(estimate); } })
      .catch(() => undefined)
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  async function remove(item: DownloadRecord) {
    await removeChapterOffline(item);
    const next = items.filter((entry) => entry.chapterId !== item.chapterId);
    setItems(next);
    setStorage(await storageEstimate());
  }

  const totalPages = items.reduce((sum, item) => sum + item.pages, 0);
  const estimatedMb = Math.round(items.reduce((sum, item) => sum + item.estimatedBytes, 0) / 1_000_000);
  const storagePercent = storage.quota ? Math.round((storage.usage / storage.quota) * 100) : 0;

  if (!ready) return <p className="loading-copy">Đang kiểm tra bộ nhớ…</p>;
  return (
    <div className="downloads-content">
      <section className="storage-meter">
        <div><HardDrive aria-hidden="true" /><span><strong>Khoảng {estimatedMb} MB</strong><small>{totalPages.toLocaleString("vi-VN")} trang đã ghim trên thiết bị</small></span></div>
        <div className="storage-meter__bar"><span style={{ width: `${Math.min(100, storagePercent)}%` }} /></div>
        <p>Thiết bị đang dùng khoảng {storagePercent}% quota trình duyệt. Mực chặn tải mới trước ngưỡng 90% và không tự xóa chương đã ghim.</p>
      </section>
      {items.length ? <ol className="download-list">{items.map((item) => <li key={item.chapterId}><CheckCircle2 aria-hidden="true" /><div><strong>{item.title}</strong><span>Chương {item.chapterName ?? "mới"} · {item.pages} trang · sẵn sàng offline</span></div><Pin aria-label="Đã ghim" /><Link href={`/read/${item.chapterId}?story=${encodeURIComponent(item.storyId)}&title=${encodeURIComponent(item.title)}`} aria-label={`Đọc ${item.title}`}><ArrowRight aria-hidden="true" /></Link><button type="button" onClick={() => remove(item)} aria-label={`Xóa ${item.title} khỏi bộ nhớ`}><Trash2 aria-hidden="true" /></button></li>)}</ol> : (
        <div className="empty-state"><DownloadCloud aria-hidden="true" /><h2>Chưa có chương nào ở lại máy.</h2><p>Vào trang truyện hoặc reader, chọn “Tải chương này”. Mực sẽ báo số trang và giữ nguyên gói đã ghim.</p><Link className="button button--ink" href="/discover">Chọn truyện để tải <ArrowRight aria-hidden="true" /></Link></div>
      )}
    </div>
  );
}
