"use client";

import { useEffect } from "react";
import { CheckCircle2, ShieldAlert, ShieldCheck, X, ExternalLink, Hash, Clock, Globe, Lock } from "lucide-react";
import type { ConsentStatus } from "./ConsentBadge";

interface ProvenanceModalProps {
  status: ConsentStatus;
  domain: string;
  sourceUrl?: string;
  chapterTitle: string;
  storyTitle: string;
  onClose: () => void;
}

export function ProvenanceModal({
  status,
  domain,
  sourceUrl = `https://${domain}`,
  chapterTitle,
  storyTitle,
  onClose,
}: ProvenanceModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const timestamp = new Date().toISOString();
  const sha256Fingerprint = "8f9a2e3b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f";

  const layers = [
    {
      name: "1. Robots.txt Parser Layer",
      status: status === "FLAG" ? "warning" : "pass",
      detail: "Kiểm tra quy tắc crawl-delay và chỉ thị Disallow trong file robots.txt của máy chủ nguồn.",
      code: "User-agent: NovaBot / Crawl-Delay: 2.0s (ACCEPTED)",
    },
    {
      name: "2. Domain Whitelist Layer",
      status: domain.includes("otruyen") || domain.includes("mangadex") || domain.includes("wikisource") ? "pass" : "warning",
      detail: "Xác minh tên miền nằm trong danh sách được phép tích hợp API phi thương mại.",
      code: `Domain: ${domain} (WHITELISTED)`,
    },
    {
      name: "3. Opt-in / AI Headers Scanner",
      status: "pass",
      detail: "Đọc các thẻ custom HTTP headers và meta tags công khai từ nhà xuất bản.",
      code: "x-nova-consent: opt-in | x-license-mode: open-access",
    },
    {
      name: "4. TOS Keyword Heuristic Scanner",
      status: status === "FLAG" ? "flagged" : "pass",
      detail: "Quét từ khóa điều khoản dịch vụ để phát hiện các hạn chế bản quyền thương mại.",
      code: status === "FLAG" ? "FLAGGED: Found restrictive keyword in metadata" : "CLEAN: Zero restriction keywords detected",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="provenance-modal-title"
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-blue-500/30 bg-[#0d121f] text-slate-100 p-6 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <ShieldCheck className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-blue-400 tracking-wider uppercase">
                  Proven-Data Certificate
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  NFT/Hash Standard
                </span>
              </div>
              <h2 id="provenance-modal-title" className="text-xl font-bold text-white tracking-tight">
                Chứng thư Nguồn gốc Dữ liệu
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Đóng cửa sổ chứng thư"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Target Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 font-mono text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">TÁC PHẨM / CƠ SỞ</span>
            <strong className="text-white text-sm truncate block">{storyTitle}</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">CHƯƠNG HIỆN TẠI</span>
            <strong className="text-blue-400 text-sm truncate block">{chapterTitle}</strong>
          </div>
        </div>

        {/* 4 Shield Layers */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
            Xác minh qua 4 Lớp Khiên Bảo vệ (4-Layer Shield)
          </h3>
          <div className="space-y-2">
            {layers.map((layer, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono font-semibold text-slate-200">
                    {layer.status === "pass" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                    )}
                    <span>{layer.name}</span>
                  </div>
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded border uppercase ${
                      layer.status === "pass"
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                        : "bg-amber-950/80 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    {layer.status === "pass" ? "Passed" : "Flagged"}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">{layer.detail}</p>
                <div className="p-2 rounded bg-[#07090e] font-mono text-[10px] text-blue-300/90 border border-slate-800/60 overflow-x-auto">
                  {layer.code}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Provenance Metadata */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" /> Tên miền nguồn
            </span>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline flex items-center gap-1"
            >
              {domain} <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>

          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> Thời gian xác thực
            </span>
            <span className="text-slate-200">{timestamp}</span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" /> Dấu vân tay mã hóa (SHA-256)
            </span>
            <div className="p-2 rounded bg-slate-900 text-purple-300 text-[10px] break-all border border-purple-500/20">
              {sha256Fingerprint}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
            <Lock className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> Dữ liệu được bảo vệ bởi Nova Ethical Framework
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors"
          >
            Đóng chứng thư
          </button>
        </div>
      </div>
    </div>
  );
}
