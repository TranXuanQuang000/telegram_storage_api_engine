"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";
import { ProvenanceModal } from "./ProvenanceModal";

export type ConsentStatus = "VERIFIED" | "FLAG" | "UNKNOWN";

interface ConsentBadgeProps {
  status: ConsentStatus | string;
  domain?: string;
  sourceUrl?: string;
  chapterTitle?: string;
  storyTitle?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ConsentBadge({
  status,
  domain = "otruyenapi.com",
  sourceUrl,
  chapterTitle = "Chương hiện tại",
  storyTitle = "Tác phẩm",
  className = "",
  size = "md",
}: ConsentBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  const normStatus = (status || "VERIFIED").toUpperCase() as ConsentStatus;

  const getBadgeStyle = () => {
    switch (normStatus) {
      case "VERIFIED":
        return {
          bg: "bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-900/60",
          icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />,
          label: "Consent Verified",
          tag: "4/4 Shield Pass",
        };
      case "FLAG":
        return {
          bg: "bg-rose-950/60 border-rose-500/40 text-rose-300 hover:border-rose-400 hover:bg-rose-900/60",
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" aria-hidden="true" />,
          label: "Needs Review",
          tag: "TOS Flagged",
        };
      default:
        return {
          bg: "bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500",
          icon: <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />,
          label: "Unknown Source",
          tag: "Unverified",
        };
    }
  };

  const badgeStyle = getBadgeStyle();
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-xs font-mono"
      : size === "lg"
      ? "px-3.5 py-1.5 text-sm font-mono"
      : "px-2.5 py-1 text-xs font-mono";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full border transition-all cursor-pointer shadow-sm ${badgeStyle.bg} ${sizeClasses} ${className}`}
        title="Bấm để xem Chứng thư nguồn gốc (Provenance)"
        aria-label={`Trạng thái bản quyền: ${badgeStyle.label}. Bấm để xem chi tiết chứng thư.`}
      >
        {badgeStyle.icon}
        <span className="font-semibold tracking-wide">{badgeStyle.label}</span>
        <span className="opacity-70 text-[10px] uppercase tracking-wider hidden sm:inline">
          · {badgeStyle.tag}
        </span>
      </button>

      {isOpen && (
        <ProvenanceModal
          status={normStatus}
          domain={domain}
          sourceUrl={sourceUrl}
          chapterTitle={chapterTitle}
          storyTitle={storyTitle}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
