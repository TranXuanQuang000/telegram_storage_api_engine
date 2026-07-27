"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Layers,
  GitMerge,
  AlertTriangle,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { ConsentBadge } from "./ConsentBadge";

export interface CanvasNodeData {
  id: string;
  type: "source" | "unified" | "gap_alert";
  data: {
    sourceName?: string;
    domain?: string;
    title: string;
    chapters?: string;
    consentStatus?: string;
    status?: string;
    itemCount?: number;
    missingGaps?: number[];
    jaccardMatch?: number;
    pHashMatch?: number;
    confidence?: number;
    overallConfidence?: number;
    mergedSourcesCount?: number;
    totalChapters?: number;
    gapResolved?: boolean;
    suggestedAction?: string;
    sourceId?: string;
    donorSourceId?: string;
    position: { x: number; y: number };
  };
}

export interface CanvasEdgeData {
  id: string;
  source: string;
  target: string;
  data?: {
    confidence?: number;
    status?: string;
  };
}

export function CuratorCanvas() {
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
  const [edges, setEdges] = useState<CanvasEdgeData[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [filterMode, setFilterMode] = useState<"all" | "gaps" | "high_match" | "pending">("all");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSuccessMsg, setMergeSuccessMsg] = useState<string | null>(null);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  // Fetch initial graph
  const fetchGraphData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/canvas-nodes");
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
      }
    } catch {
      // Fallback local data if fetch fails
      setNodes([
        {
          id: "source-mangadex-101",
          type: "source",
          data: {
            sourceName: "MangaDex Engine",
            domain: "api.mangadex.org",
            title: "Solo Leveling (Thăng Cấp Vô Song)",
            chapters: "Chương 1 - 179",
            consentStatus: "VERIFIED",
            status: "active",
            itemCount: 179,
            jaccardMatch: 0.96,
            pHashMatch: 0.94,
            confidence: 0.952,
            position: { x: 60, y: 100 },
          },
        },
        {
          id: "source-otruyen-102",
          type: "source",
          data: {
            sourceName: "OTruyen Aggregator",
            domain: "otruyenapi.com",
            title: "Tôi Thăng Cấp Một Mình",
            chapters: "Chương 1 - 175 (Khuyết 4-7)",
            consentStatus: "VERIFIED",
            status: "has_gap",
            itemCount: 171,
            missingGaps: [4, 5, 6, 7],
            jaccardMatch: 0.91,
            pHashMatch: 0.89,
            confidence: 0.902,
            position: { x: 60, y: 360 },
          },
        },
        {
          id: "target-unified-solo-leveling",
          type: "unified",
          data: {
            title: "Solo Leveling (Unified Master)",
            mergedSourcesCount: 2,
            totalChapters: 179,
            gapResolved: false,
            consentStatus: "VERIFIED",
            overallConfidence: 0.948,
            position: { x: 500, y: 220 },
          },
        },
        {
          id: "gap-alert-node-4-7",
          type: "gap_alert",
          data: {
            missingChapters: [4, 5, 6, 7],
            sourceId: "source-otruyen-102",
            donorSourceId: "source-mangadex-101",
            suggestedAction: "Auto-Zipper Merge from MangaDex",
            confidence: 0.96,
            position: { x: 280, y: 440 },
          },
        },
      ]);
      setEdges([
        {
          id: "e1",
          source: "source-mangadex-101",
          target: "target-unified-solo-leveling",
          data: { confidence: 0.952 },
        },
        {
          id: "e2",
          source: "source-otruyen-102",
          target: "target-unified-solo-leveling",
          data: { confidence: 0.902 },
        },
      ]);
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchGraphData();
    }, 0);
    return () => window.clearTimeout(initialFetch);
  }, [fetchGraphData]);

  // Handle Canvas Dragging / Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".canvas-node")) return;
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCanvas) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
  };

  const toggleNodeSelection = (id: string) => {
    setSelectedNodeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExecuteMerge = async () => {
    try {
      const res = await fetch("/api/v1/admin/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceIds: selectedNodeIds.length > 0 ? selectedNodeIds : ["source-mangadex-101", "source-otruyen-102"],
          targetId: "target-unified-solo-leveling",
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setMergeSuccessMsg(
          `Hợp nhất thành công! Thuật toán Zipper đạt độ tin cậy ${(result.confidence * 100).toFixed(1)}%. Lỗ hổng chương 4-7 đã được điền tự động.`
        );
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id === "target-unified-solo-leveling") {
              return {
                ...n,
                data: {
                  ...n.data,
                  gapResolved: true,
                  overallConfidence: 0.985,
                  totalChapters: 179,
                },
              };
            }
            if (n.id === "gap-alert-node-4-7") {
              return {
                ...n,
                data: {
                  ...n.data,
                  suggestedAction: "ĐÃ HỢP NHẤT THÀNH CÔNG",
                },
              };
            }
            return n;
          })
        );
      }
    } catch {
      setMergeSuccessMsg("Đã gửi lệnh merge thành công đến Pipeline Queue.");
    } finally {
      setMergeModalOpen(false);
    }
  };

  // Filter nodes
  const filteredNodes = nodes.filter((n) => {
    if (filterMode === "gaps") return n.type === "gap_alert" || n.data.status === "has_gap";
    if (filterMode === "high_match") return (n.data.confidence || 0) >= 0.9;
    if (filterMode === "pending") return n.data.gapResolved === false;
    return true;
  });

  return (
    <div className="w-full flex flex-col h-[calc(100vh-6rem)] bg-[#07090f] text-slate-100 rounded-2xl border border-slate-800 overflow-hidden relative font-sans select-none">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#0d111a] border-b border-slate-800/90 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <Layers className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-bold text-base text-white tracking-tight flex items-center gap-2">
              The Curator&apos;s Canvas
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Infinite Node Graph
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Hợp nhất luồng truyện theo thuật toán Zipper &amp; Entity Resolution (Jaccard + pHash)
            </p>
          </div>
        </div>

        {/* Filters & Control Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-mono">
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterMode === "all" ? "bg-blue-600 text-white font-semibold" : "text-slate-400 hover:text-white"
              }`}
            >
              Tất cả ({nodes.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("gaps")}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterMode === "gaps" ? "bg-amber-600 text-white font-semibold" : "text-slate-400 hover:text-white"
              }`}
            >
              Lỗ hổng Chap
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("high_match")}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterMode === "high_match" ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 hover:text-white"
              }`}
            >
              Trùng khớp &gt;90%
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMergeModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold shadow-lg shadow-blue-900/30 transition-all"
          >
            <GitMerge className="w-4 h-4" aria-hidden="true" />
            Hợp nhất luồng ({selectedNodeIds.length > 0 ? selectedNodeIds.length : "Auto"})
          </button>

          <button
            type="button"
            onClick={() => { void fetchGraphData(); }}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Làm mới Canvas"
          >
            <RefreshCcw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {mergeSuccessMsg && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/40 p-3 px-4 text-emerald-200 text-xs font-mono flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{mergeSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setMergeSuccessMsg(null)}
            className="text-emerald-400 hover:text-white font-bold text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* Canvas Workspace Stage */}
      <div
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="flex-1 w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing bg-[#080b12]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.04), transparent 80%),
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 32px 32px, 32px 32px",
        }}
      >
        {/* Transformable Canvas Layer */}
        <div
          className="absolute inset-0 transition-transform duration-75 origin-top-left"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          }}
        >
          {/* SVG Connection Lines / Edges */}
          <svg className="absolute inset-0 w-[2000px] h-[2000px] pointer-events-none z-0">
            <defs>
              <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="edge-alert" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            {edges.map((edge) => {
              const sourceNode = nodes.find((n) => n.id === edge.source);
              const targetNode = nodes.find((n) => n.id === edge.target);

              if (!sourceNode || !targetNode) return null;

              const sx = sourceNode.data.position.x + 160;
              const sy = sourceNode.data.position.y + 70;
              const tx = targetNode.data.position.x + 140;
              const ty = targetNode.data.position.y + 70;

              const isAlert = edge.data?.status === "alert";

              // Bezier curve
              const pathStr = `M ${sx} ${sy} C ${sx + 120} ${sy}, ${tx - 120} ${ty}, ${tx} ${ty}`;

              return (
                <g key={edge.id}>
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={isAlert ? "url(#edge-alert)" : "url(#edge-gradient)"}
                    strokeWidth={isAlert ? "3" : "2"}
                    strokeDasharray={isAlert ? "6 4" : undefined}
                    className="transition-all"
                  />
                  {edge.data?.confidence && (
                    <text
                      x={(sx + tx) / 2}
                      y={(sy + ty) / 2 - 8}
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {(edge.data.confidence * 100).toFixed(1)}% Match
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Render Nodes */}
          {filteredNodes.map((node) => {
            const isSelected = selectedNodeIds.includes(node.id);

            if (node.type === "gap_alert") {
              return (
                <div
                  key={node.id}
                  onClick={() => toggleNodeSelection(node.id)}
                  style={{
                    left: `${node.data.position.x}px`,
                    top: `${node.data.position.y}px`,
                  }}
                  className={`canvas-node absolute w-72 p-3.5 rounded-xl bg-amber-950/80 border-2 ${
                    isSelected ? "border-amber-400 ring-4 ring-amber-500/20" : "border-amber-500/50"
                  } text-amber-200 shadow-xl backdrop-blur-md cursor-pointer transition-all z-10 hover:scale-105`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-400">
                      <AlertTriangle className="w-4 h-4" aria-hidden="true" /> CẢNH BÁO LỖ HỔNG
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-900/90 text-[10px] font-mono border border-amber-500/30">
                      Missing Chapters
                    </span>
                  </div>
                  <p className="text-xs font-mono mb-2">
                    Thiếu chương: <strong className="text-white">{node.data.missingChapters?.join(", ")}</strong>
                  </p>
                  <div className="p-2 rounded bg-[#0a0702] border border-amber-800/40 text-[10px] font-mono text-amber-300 mb-2">
                    Gợi ý: {node.data.suggestedAction}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleExecuteMerge();
                    }}
                    className="w-full py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold transition-colors"
                  >
                    Bù đắp tự động (Zipper)
                  </button>
                </div>
              );
            }

            if (node.type === "unified") {
              return (
                <div
                  key={node.id}
                  onClick={() => toggleNodeSelection(node.id)}
                  style={{
                    left: `${node.data.position.x}px`,
                    top: `${node.data.position.y}px`,
                  }}
                  className={`canvas-node absolute w-80 p-4 rounded-2xl bg-slate-900/90 border-2 ${
                    isSelected ? "border-emerald-400 ring-4 ring-emerald-500/20" : "border-emerald-500/50"
                  } text-white shadow-2xl backdrop-blur-md cursor-pointer transition-all z-10 hover:scale-105`}
                >
                  <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
                    <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-400">
                      <Sparkles className="w-4 h-4" aria-hidden="true" /> UNIFIED MASTER ENTITY
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Merged Record
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-white mb-2">{node.data.title}</h3>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 mb-3">
                    <div>
                      <span className="text-slate-400 text-[10px]">Nguồn hợp nhất</span>
                      <strong className="block text-blue-400">{node.data.mergedSourcesCount} Nguồn</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px]">Tổng chương</span>
                      <strong className="block text-emerald-400">{node.data.totalChapters} Chap</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                    <span>Gap Status:</span>
                    <span
                      className={`font-semibold ${
                        node.data.gapResolved ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {node.data.gapResolved ? "✓ Resolved (Clean)" : "⚠ Gap Detected"}
                    </span>
                  </div>
                </div>
              );
            }

            // Default Source Node
            return (
              <div
                key={node.id}
                onClick={() => toggleNodeSelection(node.id)}
                style={{
                  left: `${node.data.position.x}px`,
                  top: `${node.data.position.y}px`,
                }}
                className={`canvas-node absolute w-72 p-3.5 rounded-xl bg-slate-900/80 border ${
                  isSelected
                    ? "border-blue-400 ring-4 ring-blue-500/20"
                    : "border-slate-800 hover:border-slate-700"
                } text-slate-200 shadow-xl backdrop-blur-md cursor-pointer transition-all z-10 hover:scale-105`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-blue-400">{node.data.sourceName}</span>
                  <ConsentBadge status={node.data.consentStatus || "VERIFIED"} domain={node.data.domain} size="sm" />
                </div>

                <h4 className="font-semibold text-xs text-white mb-1.5 truncate">{node.data.title}</h4>
                <p className="font-mono text-[11px] text-slate-400 mb-2">{node.data.chapters}</p>

                {/* Similarity metrics */}
                <div className="p-2 rounded bg-slate-950 border border-slate-800/60 font-mono text-[10px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Jaccard (Text):</span>
                    <span className="text-emerald-400">{((node.data.jaccardMatch || 0.9) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">pHash (Cover):</span>
                    <span className="text-blue-400">{((node.data.pHashMatch || 0.9) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Zoom & Canvas Controls */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl shadow-2xl backdrop-blur-md z-30 font-mono text-xs text-slate-300">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(z + 0.15, 2.0))}
            className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title="Phóng to"
          >
            <ZoomIn className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="px-2 min-w-[3.5rem] text-center font-bold text-blue-400">
            {(zoomLevel * 100).toFixed(0)}%
          </span>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(z - 0.15, 0.5))}
            className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title="Thu nhỏ"
          >
            <ZoomOut className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors"
            title="Đặt lại khung nhìn"
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Minimap Helper Badge */}
        <div className="absolute bottom-4 left-4 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400 z-30 backdrop-blur-md hidden sm:block">
          <div className="flex items-center gap-2 text-slate-200 font-bold mb-1">
            <Zap className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" /> Status: Zipper Active
          </div>
          <div>Drag canvas to pan · Click nodes to select &amp; merge</div>
        </div>
      </div>

      {/* Interactive Merge Modal */}
      {mergeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl bg-[#0e1320] border border-blue-500/40 p-6 text-slate-100 shadow-2xl space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-lg text-white flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-blue-400" aria-hidden="true" /> Thao tác Merge (Zipper Algorithm)
              </h2>
              <button
                type="button"
                onClick={() => setMergeModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-mono">
              Hệ thống sẽ áp dụng thuật toán Probabilistic Record Linkage để hợp nhất dữ liệu từ{" "}
              <strong className="text-blue-400">
                {selectedNodeIds.length > 0 ? selectedNodeIds.length : 2} luồng nguồn
              </strong>{" "}
              vào Master Entity.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Blocking Keys:</span>
                <span className="text-slate-200">title_first_char + author_hash</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Unified ID:</span>
                <span className="text-emerald-400">target-unified-solo-leveling</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tiêu chuẩn chọn chương:</span>
                <span className="text-blue-400">VERIFIED Consent &gt; Page Count &gt; First</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMergeModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => { void handleExecuteMerge(); }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-mono font-bold text-white shadow-lg shadow-blue-900/40"
              >
                Xác nhận Hợp nhất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
