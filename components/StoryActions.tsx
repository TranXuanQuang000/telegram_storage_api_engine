"use client";

import { Bookmark, Check, Download, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { saveChapterOffline } from "../lib/offline-store";
import type { StoryCardData } from "../lib/catalog";

export function StoryActions({ story, chapterId }: { story: StoryCardData; chapterId: string | null }) {
  const storyId = story.id;
  const title = story.title;
  const [saved, setSaved] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "working" | "done" | "error">("idle");

  useEffect(() => {
    let next = false;
    try {
      const library = JSON.parse(localStorage.getItem("muc:library") ?? "[]") as string[];
      next = library.includes(storyId);
    } catch { next = false; }
    queueMicrotask(() => setSaved(next));
  }, [storyId]);

  function toggleSaved() {
    try {
      const library = new Set(JSON.parse(localStorage.getItem("muc:library") ?? "[]") as string[]);
      const records = JSON.parse(localStorage.getItem("muc:libraryRecords") ?? "[]") as StoryCardData[];
      const wasSaved = library.has(storyId);
      if (wasSaved) library.delete(storyId); else library.add(storyId);
      localStorage.setItem("muc:library", JSON.stringify([...library]));
      localStorage.setItem("muc:libraryRecords", JSON.stringify(wasSaved ? records.filter((item) => item.id !== storyId) : [story, ...records.filter((item) => item.id !== storyId)].slice(0, 200)));
      const nextSaved = library.has(storyId);
      setSaved(nextSaved);
      void fetch(nextSaved ? "/api/library" : `/api/library?storyId=${encodeURIComponent(storyId)}`, {
        method: nextSaved ? "PUT" : "DELETE",
        headers: nextSaved ? { "Content-Type": "application/json" } : undefined,
        body: nextSaved ? JSON.stringify({ storyId, status: "reading", followed: true }) : undefined,
      }).catch(() => undefined);
    } catch { setSaved((value) => !value); }
  }

  async function download() {
    if (!chapterId || !("caches" in window)) return;
    setDownloadState("working");
    try {
      const response = await fetch(`/api/download-manifest/${chapterId}`);
      if (!response.ok) throw new Error("manifest");
      const manifest = await response.json() as { pages: string[]; estimatedBytes: number };
      await saveChapterOffline({ storyId: story.slug, title, chapterId, pages: manifest.pages.length, pageUrls: manifest.pages, estimatedBytes: manifest.estimatedBytes });
      setDownloadState("done");
    } catch { setDownloadState("error"); }
  }

  return (
    <div className="story-actions">
      <button className={`button ${saved ? "button--paper" : "button--ink"}`} type="button" onClick={toggleSaved}>
        {saved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{saved ? "Đã vào tủ" : "Thêm vào tủ"}
      </button>
      <button className="button button--paper" type="button" onClick={download} disabled={!chapterId || downloadState === "working"}>
        {downloadState === "working" ? <LoaderCircle className="spin" aria-hidden="true" /> : downloadState === "done" ? <Check aria-hidden="true" /> : <Download aria-hidden="true" />}
        {downloadState === "done" ? "Đã ghim offline" : downloadState === "error" ? "Tải lại" : "Tải chương mới"}
      </button>
    </div>
  );
}
