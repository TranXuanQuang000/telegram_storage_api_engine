import { env } from "cloudflare:workers";

const LEGACY_COMIC_API = "https://otruyenapi.com/v1/api";

type ContentApiRuntime = {
  MUC_CONTENT_API_URL?: string;
  MUC_CONTENT_API_TOKEN?: string;
  MUC_CONTENT_API_STRICT?: string;
  MUC_NOVEL_API_SOURCES?: string;
  MUC_NOVEL_API_SCAN_PAGES?: string;
};

function runtimeConfiguration() {
  return env as unknown as ContentApiRuntime;
}

function normalizedBaseUrl(value?: string) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    url.search = "";
    url.hash = "";
    url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/v1\/api$/i, "")}/v1/api`;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getContentApiConfiguration() {
  const runtime = runtimeConfiguration();
  const baseUrl = normalizedBaseUrl(
    runtime.MUC_CONTENT_API_URL ?? process.env.MUC_CONTENT_API_URL ?? process.env.NEXT_PUBLIC_OTRUYEN_API_URL,
  );
  const token = (runtime.MUC_CONTENT_API_TOKEN ?? process.env.MUC_CONTENT_API_TOKEN ?? "").trim();
  const strictRaw = runtime.MUC_CONTENT_API_STRICT ?? process.env.MUC_CONTENT_API_STRICT ?? "";
  const sourcesRaw = runtime.MUC_NOVEL_API_SOURCES
    ?? process.env.MUC_NOVEL_API_SOURCES
    ?? "hako,truyenfull,metruyenchu,tangthuvien,wikidich";
  const scanPagesRaw = runtime.MUC_NOVEL_API_SCAN_PAGES ?? process.env.MUC_NOVEL_API_SCAN_PAGES ?? "2";
  const novelSources = [...new Set(
    sourcesRaw
      .split(",")
      .map((source) => source.trim().toLowerCase())
      .filter((source) => /^(hako|truyenfull|metruyenchu|tangthuvien|wikidich|gutendex)$/.test(source)),
  )];
  return {
    baseUrl,
    token,
    strict: /^(1|true|yes|on)$/i.test(strictRaw),
    novelSources,
    novelScanPages: Math.min(Math.max(Number.parseInt(scanPagesRaw, 10) || 2, 1), 6),
  };
}

export function contentApiHeaders(targetUrl?: string) {
  const { baseUrl, token } = getContentApiConfiguration();
  let isConfiguredTarget = !targetUrl;
  if (targetUrl && baseUrl) {
    try {
      const target = new URL(targetUrl);
      const configured = new URL(baseUrl);
      isConfiguredTarget = target.origin === configured.origin
        && target.pathname.startsWith(`${configured.pathname.replace(/\/+$/, "")}/`);
    } catch {
      isConfiguredTarget = false;
    }
  }
  return {
    Accept: "application/json",
    ...(token && isConfiguredTarget ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function comicApiCandidates(path: string) {
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  // Comics always use OTruyen directly. MUC_CONTENT_API_URL remains available
  // to the novel aggregator but can no longer become a comic single point of failure.
  return [`${LEGACY_COMIC_API}${normalizedPath}`];
}

export function contentApiUrl(path: string) {
  const { baseUrl } = getContentApiConfiguration();
  if (!baseUrl) return null;
  return `${baseUrl}/${path.replace(/^\/+/, "")}`;
}

export function contentApiSourceName() {
  return "OTruyen API";
}
