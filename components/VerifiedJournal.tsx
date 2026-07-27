"use client";

import { useState } from "react";
import { Feather, ArrowRight } from "lucide-react";
import { ConsentBadge } from "./ConsentBadge";

export function VerifiedJournal() {
  const [selectedCategory, setSelectedCategory] = useState<"all" | "ethical" | "transparency" | "interviews">("all");

  const journalEntries = [
    {
      id: "entry-1",
      title: "Triết lý Data Ethics: Điểm cân bằng Nash giữa Độc giả và Nhà xuất bản",
      category: "ethical",
      author: "Nova Ethical Data Lab",
      authorRole: "Verified Aggregation Group",
      date: "26 Tháng 7, 2026",
      readTime: "5 phút đọc",
      summary:
        "Tại sao mô hình Server-Side Aggregator tuân thủ 4 Lớp Khiên Bảo Vệ (Robots.txt, Whitelist, Opt-in Headers, TOS Scanner) là bước ngoặt giải quyết bài toán bản quyền số mà Mihon/Tachiyomi chưa thể đạt tới.",
      domain: "otruyenapi.com",
      status: "VERIFIED",
      provenanceCount: "4/4 Shield Passed",
    },
    {
      id: "entry-2",
      title: "Báo cáo Minh bạch Quý II/2026: Tự động lọc 14,200 chương vi phạm DMCA",
      category: "transparency",
      author: "DevOps & Compliance Team",
      authorRole: "System Controller",
      date: "20 Tháng 7, 2026",
      readTime: "8 phút đọc",
      summary:
        "Toàn văn số liệu thống kê lượt gửi yêu cầu gỡ bỏ, kết quả kiểm tra tự động bằng TOS Keyword Scanner và tỷ lệ phản hồi trong 2 giờ đối với các đơn vị giữ bản quyền.",
      domain: "api.mangadex.org",
      status: "VERIFIED",
      provenanceCount: "4/4 Shield Passed",
    },
    {
      id: "entry-3",
      title: "Phỏng vấn Nhóm Dịch Thuật Độc Lập: Quy trình cấp Chứng thư Nguồn gốc (Provenance)",
      category: "interviews",
      author: "Editorial Inkroom",
      authorRole: "Senior Curator",
      date: "15 Tháng 7, 2026",
      readTime: "6 phút đọc",
      summary:
        "Làm thế nào các nhóm dịch phi thương mại có thể gắn custom HTTP headers (`x-nova-consent: opt-in`) để tác phẩm của họ được xuất bản trực tiếp lên Verified Journal mà không lo rủi ro bị mạo danh.",
      domain: "vi.wikisource.org",
      status: "VERIFIED",
      provenanceCount: "4/4 Shield Passed",
    },
  ];

  const filteredEntries = journalEntries.filter((e) =>
    selectedCategory === "all" ? true : e.category === selectedCategory
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10 py-6 px-4 text-slate-100 font-sans">
      {/* Journal Hero Section */}
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
          <Feather className="w-4 h-4" aria-hidden="true" />
          <span>EDITORIAL &amp; VERIFIED JOURNAL</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-serif">
          Ấn phẩm Minh bạch &amp; Đạo đức Dữ liệu
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
          Nơi tôn vinh các tác phẩm chuẩn pháp lý, chia sẻ báo cáo minh bạch dữ liệu và kết nối độc giả văn minh với những nhóm dịch được xác thực.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex justify-center border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-4 py-1.5 rounded-lg transition-colors ${
              selectedCategory === "all" ? "bg-blue-600 text-white font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Tất cả bài viết
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("ethical")}
            className={`px-4 py-1.5 rounded-lg transition-colors ${
              selectedCategory === "ethical" ? "bg-emerald-600 text-white font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Data Ethics
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("transparency")}
            className={`px-4 py-1.5 rounded-lg transition-colors ${
              selectedCategory === "transparency" ? "bg-purple-600 text-white font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Báo cáo Minh bạch
          </button>
        </div>
      </div>

      {/* Featured Entry Card */}
      {filteredEntries[0] && (
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all space-y-4 shadow-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <span className="text-blue-400 font-bold uppercase tracking-wider">
              {filteredEntries[0].category.toUpperCase()} · FEATURED
            </span>
            <span>{filteredEntries[0].date} · {filteredEntries[0].readTime}</span>
          </div>

          <h2 className="text-xl sm:text-3xl font-bold font-serif text-white hover:text-blue-300 transition-colors cursor-pointer">
            {filteredEntries[0].title}
          </h2>

          <p className="text-slate-300 text-sm leading-relaxed">{filteredEntries[0].summary}</p>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 grid place-items-center text-emerald-400 font-bold font-mono text-xs">
                NV
              </div>
              <div>
                <strong className="block text-xs text-white font-semibold">{filteredEntries[0].author}</strong>
                <span className="text-[11px] text-slate-400 font-mono">{filteredEntries[0].authorRole}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ConsentBadge status={filteredEntries[0].status} domain={filteredEntries[0].domain} size="md" />
              <button
                type="button"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold transition-all"
              >
                Đọc toàn văn <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid of Other Entries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredEntries.slice(1).map((entry) => (
          <div
            key={entry.id}
            className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                <span className="text-purple-400 uppercase font-bold">{entry.category}</span>
                <span>{entry.date}</span>
              </div>
              <h3 className="font-serif font-bold text-lg text-white hover:text-blue-300 transition-colors">
                {entry.title}
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed line-clamp-3">{entry.summary}</p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
              <span className="text-xs text-slate-400 font-mono">{entry.author}</span>
              <ConsentBadge status={entry.status} domain={entry.domain} size="sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
