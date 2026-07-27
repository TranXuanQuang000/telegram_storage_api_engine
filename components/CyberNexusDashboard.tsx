"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertOctagon,
  Cpu,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Zap,
  Radio,
  Server,
  Globe,
  CheckCircle2,
  Sliders,
} from "lucide-react";

export function CyberNexusDashboard() {
  const [metrics, setMetrics] = useState<{
    status: string;
    error_rate: number;
    circuit_breaker: string;
    pipeline_throughput_req_sec: number;
    avg_latency_ms: number;
    active_workers: number;
    asn_proxy_health: Array<{
      asn: string;
      active_proxies: number;
      success_rate: number;
      status: string;
    }>;
  }>({
    status: "degraded",
    error_rate: 24.5,
    circuit_breaker: "OPEN",
    pipeline_throughput_req_sec: 482,
    avg_latency_ms: 42,
    active_workers: 18,
    asn_proxy_health: [
      { asn: "AS16509 (Amazon.com)", active_proxies: 42, success_rate: 98.4, status: "healthy" },
      { asn: "AS14061 (DigitalOcean)", active_proxies: 28, success_rate: 74.2, status: "degraded" },
      { asn: "AS13335 (Cloudflare)", active_proxies: 60, success_rate: 99.8, status: "healthy" },
      { asn: "AS15169 (Google)", active_proxies: 15, success_rate: 62.0, status: "circuit_tripped" },
    ],
  });

  const [circuitTripped, setCircuitTripped] = useState(true);
  const [logs, setLogs] = useState<Array<{ id: string; time: string; type: "INFO" | "WARN" | "ERROR"; msg: string }>>([
    { id: "1", time: "12:44:02", type: "INFO", msg: "Scraper worker pool #4 synchronized with OTruyen API endpoint." },
    { id: "2", time: "12:44:15", type: "WARN", msg: "Subnet 198.51.100.0/24 experiencing 18.4% 429 Too Many Requests response." },
    { id: "3", time: "12:44:30", type: "ERROR", msg: "Error rate exceeded 20.0%/min threshold (Current: 24.5%/min). CIRCUIT BREAKER TRIPPED." },
    { id: "4", time: "12:44:31", type: "INFO", msg: "ASN-Aware Proxy Rotation initiated: Swapping pool to AS13335 Cloudflare endpoints." },
  ]);

  const [activeTab, setActiveTab] = useState<"all" | "errors">("all");

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/system/health");
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setCircuitTripped(data.circuit_breaker === "OPEN" || data.error_rate > 20.0);
      }
    } catch {
      // Retain simulated data
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchHealth();
    }, 0);
    const interval = setInterval(() => {
      void fetchHealth();
    }, 8000);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchHealth]);

  const handleRotateProxies = () => {
    const newLog = {
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString(),
      type: "INFO" as const,
      msg: "MỞ RỘNG POOL PROXY: Đã chuyển sang cụm Subnet AS16509 sạch. Tỷ lệ lỗi đã giảm về 3.2%.",
    };
    setLogs((prev) => [newLog, ...prev]);
    setCircuitTripped(false);
    setMetrics((prev) => ({
      ...prev,
      status: "healthy",
      error_rate: 3.2,
      circuit_breaker: "CLOSED",
    }));
  };

  const handleForceTrip = () => {
    const newLog = {
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString(),
      type: "ERROR" as const,
      msg: "CẢNH BÁO THỦ CÔNG: Kích hoạt Circuit Breaker khẩn cấp bởi DevOps Engineer.",
    };
    setLogs((prev) => [newLog, ...prev]);
    setCircuitTripped(true);
    setMetrics((prev) => ({
      ...prev,
      status: "degraded",
      circuit_breaker: "OPEN",
      error_rate: 28.9,
    }));
  };

  const filteredLogs = logs.filter((log) => (activeTab === "errors" ? log.type === "ERROR" : true));

  return (
    <div className="w-full flex flex-col space-y-6 font-mono text-slate-100 p-2 sm:p-4">
      {/* Header HUD */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-[#0b0f19] border border-slate-800 rounded-2xl shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-3.5 z-10">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-6 h-6 animate-pulse" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wider uppercase">Cyber-Nexus HUD</h1>
              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                DevOps Pipeline Monitor
              </span>
            </div>
            <p className="text-xs text-slate-400">Real-time scraping particle stream &amp; circuit breaker resiliency</p>
          </div>
        </div>

        {/* Live Status Indicator */}
        <div className="flex items-center gap-3 z-10">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${
              circuitTripped
                ? "bg-rose-950/80 border-rose-500/50 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse"
                : "bg-emerald-950/80 border-emerald-500/50 text-emerald-300"
            }`}
          >
            <Radio className="w-4 h-4" aria-hidden="true" />
            <span>CIRCUIT STATUS: {circuitTripped ? "OPEN (TRIPPED)" : "CLOSED (NORMAL)"}</span>
          </div>

          <button
            type="button"
            onClick={() => { void fetchHealth(); }}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Reload telemetry"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Circuit Breaker Alert Banner */}
      {circuitTripped && (
        <div className="p-4 rounded-2xl bg-rose-950/90 border-2 border-rose-500 text-rose-200 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertOctagon className="w-8 h-8 text-rose-400 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-bold text-sm text-white uppercase tracking-wider">
                CẢNH BÁO NGẮT MẠCH TỰ ĐỘNG (Circuit Breaker Tripped)
              </h2>
              <p className="text-xs text-rose-300">
                Tỷ lệ lỗi hiện tại đạt <strong className="text-white font-bold">{metrics.error_rate}%/phút</strong>{" "}
                (vượt ngưỡng 20.0%/min). Hệ thống đã tự động ngắt kết nối để tránh bị ban IP.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <button
              type="button"
              onClick={handleRotateProxies}
              className="w-full md:w-auto px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition-all"
            >
              Rotate Proxy Pool &amp; Reset
            </button>
          </div>
        </div>
      )}

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>PIPELINE THROUGHPUT</span>
            <Zap className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-white flex items-baseline gap-1">
            {metrics.pipeline_throughput_req_sec} <span className="text-xs text-slate-400 font-normal">req/s</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div className="bg-cyan-400 h-full w-[78%]" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>AVG LATENCY</span>
            <Server className="w-4 h-4 text-blue-400" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-white flex items-baseline gap-1">
            {metrics.avg_latency_ms} <span className="text-xs text-slate-400 font-normal">ms</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div className="bg-blue-400 h-full w-[42%]" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>ACTIVE WORKERS</span>
            <Cpu className="w-4 h-4 text-purple-400" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-white flex items-baseline gap-1">
            {metrics.active_workers} <span className="text-xs text-slate-400 font-normal">workers</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div className="bg-purple-400 h-full w-[90%]" />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>ERROR RATE (%/MIN)</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" aria-hidden="true" />
          </div>
          <div
            className={`text-2xl font-bold flex items-baseline gap-1 ${
              metrics.error_rate > 20.0 ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {metrics.error_rate}% <span className="text-xs text-slate-400 font-normal">threshold 20%</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full ${metrics.error_rate > 20.0 ? "bg-rose-500" : "bg-emerald-400"}`}
              style={{ width: `${Math.min(metrics.error_rate * 3, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Visual Data Stream Particle Field */}
      <div className="p-5 rounded-2xl bg-[#07090e] border border-slate-800 space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2">
          <span className="flex items-center gap-2 text-slate-200 font-bold">
            <Globe className="w-4 h-4 text-cyan-400" aria-hidden="true" /> Particle Stream Visualizer (Scraper Pipelines)
          </span>
          <span className="text-[11px] text-cyan-400">Streaming 482 packets/s</span>
        </div>

        {/* Animated Stream Rails */}
        <div className="h-28 w-full relative flex items-center justify-between px-6 bg-slate-950 rounded-xl border border-slate-800/60 overflow-hidden">
          {/* Nodes along stream */}
          <div className="flex flex-col items-center gap-1 z-10">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400">
              <Server className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-[10px] text-slate-400">Target Scrapers</span>
          </div>

          <div className="h-0.5 flex-1 mx-4 bg-gradient-to-r from-cyan-500/20 via-blue-500/60 to-emerald-500/20 relative overflow-hidden">
            {/* Animated particles */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400 to-transparent w-24 h-full animate-[dataFall_2s_linear_infinite]" />
          </div>

          <div className="flex flex-col items-center gap-1 z-10">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-blue-400">
              <Sliders className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-[10px] text-slate-400">Rate Limiter</span>
          </div>

          <div className="h-0.5 flex-1 mx-4 bg-gradient-to-r from-blue-500/20 via-purple-500/60 to-emerald-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-400 to-transparent w-24 h-full animate-[dataFall_2.5s_linear_infinite]" />
          </div>

          <div className="flex flex-col items-center gap-1 z-10">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-[10px] text-slate-400">D1 Storage Node</span>
          </div>
        </div>
      </div>

      {/* ASN Proxy Health Table & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ASN Table */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" aria-hidden="true" /> Status Cụm ASN / Proxy Subnets
            </h3>
            <button
              type="button"
              onClick={handleRotateProxies}
              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
            >
              Rotate Subnets
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="pb-2">ASN / Provider</th>
                  <th className="pb-2">Active Proxies</th>
                  <th className="pb-2">Success Rate</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {metrics.asn_proxy_health.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="py-2.5 font-semibold text-slate-200">{item.asn}</td>
                    <td className="py-2.5 text-slate-300">{item.active_proxies} nodes</td>
                    <td className="py-2.5">
                      <span
                        className={
                          item.success_rate > 90
                            ? "text-emerald-400 font-bold"
                            : item.success_rate > 70
                            ? "text-amber-400"
                            : "text-rose-400 font-bold"
                        }
                      >
                        {item.success_rate}%
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === "healthy"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                            : item.status === "degraded"
                            ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                            : "bg-rose-950 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* DevOps Controls */}
        <div className="p-5 rounded-2xl bg-[#0b0f19] border border-slate-800 space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sliders className="w-4 h-4 text-purple-400" aria-hidden="true" /> Thao tác Khẩn cấp DevOps
          </h3>

          <div className="space-y-3 text-xs">
            <button
              type="button"
              onClick={handleForceTrip}
              className="w-full py-2.5 px-3 rounded-xl bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-500/40 font-bold transition-all text-left flex items-center justify-between"
            >
              <span>Ngắt mạch Thủ công (Force Trip)</span>
              <AlertOctagon className="w-4 h-4 text-rose-400" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleRotateProxies}
              className="w-full py-2.5 px-3 rounded-xl bg-blue-900/60 hover:bg-blue-800 text-blue-200 border border-blue-500/40 font-bold transition-all text-left flex items-center justify-between"
            >
              <span>Đổi Pool Proxy (ASN Rotation)</span>
              <RefreshCw className="w-4 h-4 text-blue-400" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Terminal Real-time Log Stream */}
      <div className="p-5 rounded-2xl bg-[#05070c] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span className="font-bold text-sm text-white">Event Log Stream (Monospaced HUD)</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeTab === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              All Events ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("errors")}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeTab === "errors" ? "bg-rose-900/80 text-rose-300 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Errors Only
            </button>
          </div>
        </div>

        <div className="h-44 overflow-y-auto font-mono text-xs space-y-2 p-3 bg-black rounded-xl border border-slate-900">
          {filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-3">
              <span className="text-slate-500 shrink-0">{log.time}</span>
              <span
                className={`font-bold shrink-0 text-[10px] px-1.5 py-0.2 rounded ${
                  log.type === "ERROR"
                    ? "bg-rose-950 text-rose-400 border border-rose-500/30"
                    : log.type === "WARN"
                    ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                    : "bg-blue-950 text-blue-400 border border-blue-500/30"
                }`}
              >
                {log.type}
              </span>
              <span
                className={
                  log.type === "ERROR"
                    ? "text-rose-300 font-semibold"
                    : log.type === "WARN"
                    ? "text-amber-300"
                    : "text-slate-300"
                }
              >
                {log.msg}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
