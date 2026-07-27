"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Database,
  HardDrive,
  KeyRound,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

type ServiceStatus = {
  ok: boolean;
  name: string;
  latencyMs: number;
  statusCode?: number;
  database?: string;
  version?: string | null;
  error?: string | null;
};

type SyncState = {
  _id?: string;
  sourceKey: string;
  cursorPage?: number;
  completedRound?: boolean;
  imported?: number;
  updated?: number;
  lastError?: string | null;
  lastRunAt?: string | null;
  manifestCompletedRound?: boolean;
  manifestUpdated?: number;
  manifestFailed?: number;
  manifestLastRunAt?: string | null;
  manifestLastError?: string | null;
};

type NovelSource = {
  id: string;
  circuit: string;
  success_ewma: number;
  latency_ewma_ms: number | null;
  successes: number;
  failures: number;
};

type DashboardData = {
  status: "success";
  generatedAt: string;
  services: {
    website: ServiceStatus;
    manga: ServiceStatus;
    novel: ServiceStatus;
  };
  manga: {
    available: boolean;
    error?: string;
    mangaCount: number;
    chapterManifests: number;
    cachedChapters: number;
    queue: Record<string, number | string>;
    syncStates: SyncState[];
  };
  novel: {
    available: boolean;
    snapshot: null | {
      enabled?: boolean;
      available?: boolean;
      generated_at?: string;
      total_items?: number;
      sources?: Record<string, unknown>;
      [key: string]: unknown;
    };
    sources: NovelSource[];
    sourceHealthError?: string | null;
    capabilities: null | {
      novelApi: boolean;
      adaptiveSelection: boolean;
      coverageAudit: boolean;
    };
  };
};

const TOKEN_KEY = "muc-admin-dashboard-token";
const REFRESH_INTERVAL_MS = 15_000;

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("vi-VN").format(value ?? 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Chưa chạy";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    nettruyen: "NetTruyen",
    truyenqq: "TruyenQQ",
    hako: "Hako / DocLN",
    truyenfull: "TruyenFull",
    metruyenchu: "Mê Truyện Chữ",
    tangthuvien: "Tàng Thư Viện",
    wikidich: "WikiDich",
    gutendex: "Project Gutenberg",
    mangadex: "MangaDex",
    otruyen: "OTruyen",
    xkcd: "xkcd",
  };
  return labels[source.toLowerCase()] ?? source;
}

function statusTone(ok: boolean) {
  return ok
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-rose-500/30 bg-rose-500/10 text-rose-300";
}

function ServiceCard({ service, icon: Icon }: { service: ServiceStatus; icon: typeof Server }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-[#0a0f19]/90 p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{service.name}</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
            {service.ok ? "Đang hoạt động" : "Mất kết nối"}
          </p>
        </div>
        <div className={`rounded-xl border p-2 ${statusTone(service.ok)}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
        <span className="text-slate-500">Độ trễ kiểm tra</span>
        <span className="font-mono text-slate-300">{service.latencyMs} ms</span>
      </div>
      {service.error ? <p className="mt-2 text-xs text-rose-300">{service.error}</p> : null}
    </article>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Database;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-[#09101b]/90 p-5">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-cyan-400/5 blur-2xl" />
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-cyan-400" aria-hidden="true" />
      </div>
      <strong className="mt-3 block text-3xl font-black tracking-tight text-white">{value}</strong>
      <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p>
    </article>
  );
}

export function CyberNexusDashboard() {
  const [token, setToken] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(async (adminToken: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/dashboard", {
        headers: { "x-admin-token": adminToken },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as {
        message?: string;
      } | DashboardData | null;
      if (!response.ok) {
        if (response.status === 401) {
          window.sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
        }
        const message = payload && "message" in payload ? payload.message : null;
        throw new Error(message ?? `Không đọc được trạng thái (HTTP ${response.status})`);
      }
      setData(payload as DashboardData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không tải được dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = window.sessionStorage.getItem(TOKEN_KEY) ?? "";
      if (saved) {
        setToken(saved);
        setDraftToken(saved);
        void fetchDashboard(saved);
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, [fetchDashboard]);

  useEffect(() => {
    if (!token) return;
    const interval = window.setInterval(() => void fetchDashboard(token), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchDashboard, token]);

  const totalNovelItems = useMemo(() => {
    const value = data?.novel.snapshot?.total_items;
    return typeof value === "number" ? value : 0;
  }, [data]);

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draftToken.trim();
    if (!value) return;
    window.sessionStorage.setItem(TOKEN_KEY, value);
    setToken(value);
    void fetchDashboard(value);
  }

  function lock() {
    window.sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setDraftToken("");
    setData(null);
    setError("");
  }

  if (!token) {
    return (
      <section className="mx-auto mt-14 max-w-md rounded-3xl border border-cyan-500/20 bg-[#080d16]/95 p-6 shadow-[0_0_60px_rgba(34,211,238,0.08)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
          <KeyRound className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-center text-xl font-black text-white">Trung tâm vận hành</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-400">
          Nhập mã quản trị để xem số liệu crawler thật. Mã chỉ được giữ trong tab hiện tại.
        </p>
        <form className="mt-6 space-y-3" onSubmit={unlock}>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400" htmlFor="admin-token">
            Mã quản trị
          </label>
          <input
            id="admin-token"
            type="password"
            autoComplete="off"
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
            placeholder="••••••••••••••••"
          />
          <button type="submit" className="button button--ink w-full justify-center">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Mở dashboard
          </button>
        </form>
        {error ? <p className="mt-4 text-center text-sm text-rose-300">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="w-full space-y-6 p-2 font-mono text-slate-100 sm:p-4">
      <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#080d16]/95 p-5 shadow-2xl">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-300">
              <Activity className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black uppercase tracking-wider text-white">Mục Truyện Operations</h1>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  DỮ LIỆU THẬT
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Cập nhật tự động mỗi 15 giây · Lần cuối: {formatDate(data?.generatedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchDashboard(token)}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-500/50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Làm mới
            </button>
            <button
              type="button"
              onClick={lock}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400 transition hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Khóa
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {!data && loading ? (
        <div className="flex min-h-64 items-center justify-center gap-3 text-slate-400">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> Đang lấy telemetry…
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ServiceCard service={data.services.website} icon={ShieldCheck} />
            <ServiceCard service={data.services.manga} icon={Server} />
            <ServiceCard service={data.services.novel} icon={BookOpen} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Kho truyện tranh"
              value={formatNumber(data.manga.mangaCount)}
              hint="Số bộ đã nhập vào MongoDB catalog."
              icon={Database}
            />
            <StatCard
              label="Manifest chapter"
              value={formatNumber(data.manga.chapterManifests)}
              hint="Chapter đã lập danh sách ảnh; không đồng nghĩa mọi ảnh đã tải."
              icon={BookOpen}
            />
            <StatCard
              label="Chapter đã cache"
              value={formatNumber(data.manga.cachedChapters)}
              hint="Nội dung chapter đã sẵn sàng trong cache."
              icon={HardDrive}
            />
            <StatCard
              label="Kho truyện chữ"
              value={formatNumber(totalNovelItems)}
              hint={data.novel.snapshot?.available ? "Snapshot đang được backend sử dụng." : "Snapshot production chưa sẵn sàng."}
              icon={BookOpen}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <article className="overflow-hidden rounded-2xl border border-slate-800 bg-[#080d16]/95 xl:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div>
                  <h2 className="font-bold text-white">Tiến trình crawler truyện tranh</h2>
                  <p className="mt-1 text-xs text-slate-500">Cursor là trang nguồn tiếp theo sẽ được quét.</p>
                </div>
                <Database className="h-5 w-5 text-cyan-400" aria-hidden="true" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Nguồn</th>
                      <th className="px-5 py-3">Trang cursor</th>
                      <th className="px-5 py-3">Đã nhập</th>
                      <th className="px-5 py-3">Đã cập nhật</th>
                      <th className="px-5 py-3">Lần chạy cuối</th>
                      <th className="px-5 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.manga.syncStates.map((source) => {
                      const healthy = !source.lastError;
                      return (
                        <tr key={source._id ?? source.sourceKey} className="text-slate-300">
                          <td className="px-5 py-4 font-bold text-white">{sourceLabel(source.sourceKey)}</td>
                          <td className="px-5 py-4 text-cyan-300">{formatNumber(source.cursorPage)}</td>
                          <td className="px-5 py-4">{formatNumber(source.imported)}</td>
                          <td className="px-5 py-4">{formatNumber(source.updated)}</td>
                          <td className="px-5 py-4 text-slate-500">{formatDate(source.lastRunAt)}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-md border px-2 py-1 ${statusTone(healthy)}`}>
                              {source.completedRound ? "Đã hết một vòng" : healthy ? "Đang đồng bộ" : "Có lỗi"}
                            </span>
                            {source.lastError ? <p className="mt-2 max-w-xs text-rose-300">{source.lastError}</p> : null}
                          </td>
                        </tr>
                      );
                    })}
                    {!data.manga.syncStates.length ? (
                      <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={6}>{data.manga.error ?? "Chưa có trạng thái nguồn."}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-[#080d16]/95 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-white">Hàng đợi chapter</h2>
                <Clock3 className="h-5 w-5 text-violet-400" aria-hidden="true" />
              </div>
              <div className="mt-4 space-y-2">
                {Object.entries(data.manga.queue).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3 text-xs">
                    <span className="capitalize text-slate-500">{key}</span>
                    <strong className="text-white">{typeof value === "number" ? formatNumber(value) : String(value)}</strong>
                  </div>
                ))}
                {!Object.keys(data.manga.queue).length ? <p className="py-6 text-center text-xs text-slate-500">Chưa có dữ liệu queue.</p> : null}
              </div>
            </article>
          </div>

          <article className="overflow-hidden rounded-2xl border border-slate-800 bg-[#080d16]/95">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div>
                <h2 className="font-bold text-white">Sức khỏe nguồn truyện chữ</h2>
                <p className="mt-1 text-xs text-slate-500">Circuit, tỷ lệ thành công, độ trễ và số lỗi quan sát được.</p>
              </div>
              <span className={`rounded-md border px-2 py-1 text-xs ${statusTone(Boolean(data.novel.snapshot?.available))}`}>
                Snapshot: {data.novel.snapshot?.available ? "sẵn sàng" : "chưa publish"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.novel.sources.map((source) => {
                const healthy = source.circuit === "closed";
                return (
                  <div key={source.id} className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-white">{sourceLabel(source.id)}</strong>
                      {healthy
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                        : <WifiOff className="h-4 w-4 text-rose-400" aria-hidden="true" />}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <span>Success EWMA</span><span className="text-right text-slate-300">{Math.round(source.success_ewma * 100)}%</span>
                      <span>Độ trễ</span><span className="text-right text-slate-300">{source.latency_ewma_ms ?? "—"} ms</span>
                      <span>Thành công / lỗi</span><span className="text-right text-slate-300">{source.successes} / {source.failures}</span>
                    </div>
                  </div>
                );
              })}
              {!data.novel.sources.length ? (
                <p className="col-span-full py-8 text-center text-sm text-slate-500">
                  {data.novel.sourceHealthError ?? "Chưa có dữ liệu nguồn truyện chữ."}
                </p>
              ) : null}
            </div>
          </article>

          <aside className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
              <div>
                <h2 className="font-bold text-amber-100">Laptop tắt thì tiến trình nào vẫn chạy?</h2>
                <p className="mt-2 text-sm leading-6 text-amber-100/70">
                  Backend và crawler được chạy trực tiếp trên Render vẫn tiếp tục. Các script PowerShell/Python đang chạy
                  trên laptop sẽ dừng ngay khi máy tắt hoặc sleep. Muốn đồng bộ 24/7, scheduler và worker phải được chuyển
                  hoàn toàn lên Render Worker/Cron Job; dashboard này chỉ giám sát, không giữ script local sống.
                </p>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
