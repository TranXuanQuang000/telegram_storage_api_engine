import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
const chapters = [
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `a-q-chinh-truyen--${index + 1}`,
    sourceTitle: `A Q. chính truyện/Chương ${index + 1}`,
  })),
  { id: "nhat-ky-nguoi-dien--1", sourceTitle: "Nhật ký người điên" },
  { id: "thuoc--1", sourceTitle: "Thuốc" },
  ...roman.map((numeral, index) => ({
    id: `tro-vo-lua-ra--${index + 1}`,
    sourceTitle: `Trở vỏ lửa ra/${numeral}`,
  })),
];

function decodeEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? "";
  });
}

function extractParagraphs(rawHtml) {
  const proseIndex = rawHtml.search(/<div[^>]+class="[^"]*\bprose\b/i);
  let html = proseIndex >= 0 ? rawHtml.slice(proseIndex) : rawHtml;
  const footerIndex = html.search(/<div[^>]+class="[^"]*(?:printfooter|catlinks|licenseContainer)/i);
  if (footerIndex >= 0) html = html.slice(0, footerIndex);
  html = html
    .replace(/<(script|style|table|figure|sup)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(html)
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, " ").trim())
    .filter((paragraph) =>
      paragraph.length >= 2
      && !/^(Chú thích|Tham khảo|Mục lục|Trang Chính)$/i.test(paragraph)
    )
    .slice(0, 2_000);
}

async function fetchWithRateLimit(url, init) {
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    if (response.status !== 429) return response;
    const retryAfter = Math.min(Number(response.headers.get("retry-after")) || 5, 30);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000 + 250));
  }
  return response;
}

async function loadChapter(chapter) {
  const query = new URLSearchParams({
    action: "parse",
    page: chapter.sourceTitle,
    prop: "text",
    redirects: "1",
    format: "json",
    origin: "*",
  });
  const headers = {
    "Api-User-Agent": "MucReader/0.1 (public-domain reader sync)",
  };
  const response = await fetchWithRateLimit(`https://vi.wikisource.org/w/api.php?${query}`, {
    headers: {
      Accept: "application/json",
      ...headers,
    },
  });
  let rawHtml;
  if (response.ok) {
    const payload = await response.json();
    rawHtml = payload.parse?.text?.["*"] ?? "";
  } else {
    const fallback = await fetchWithRateLimit(
      `https://api.wikimedia.org/core/v1/wikisource/vi/page/${encodeURIComponent(chapter.sourceTitle)}/html`,
      {
        headers: { Accept: "text/html", ...headers },
      },
    );
    if (!fallback.ok) {
      throw new Error(`${chapter.sourceTitle}: HTTP ${response.status}/${fallback.status}`);
    }
    rawHtml = await fallback.text();
  }
  const paragraphs = extractParagraphs(rawHtml);
  if (!paragraphs.length) throw new Error(`${chapter.sourceTitle}: empty content`);
  return [chapter.id, paragraphs];
}

const outputDirectory = path.resolve("data");
const outputPath = path.join(outputDirectory, "novel-content.json");
await mkdir(outputDirectory, { recursive: true });
let content = {};
try {
  content = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  // First sync has no checkpoint yet.
}

for (const chapter of chapters) {
  if (Array.isArray(content[chapter.id]) && content[chapter.id].length) {
    process.stdout.write(`Kept ${chapter.id}: ${content[chapter.id].length} paragraphs\n`);
    continue;
  }
  const entry = await loadChapter(chapter);
  content[entry[0]] = entry[1];
  await writeFile(outputPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  process.stdout.write(`Synced ${chapter.id}: ${entry[1].length} paragraphs\n`);
  await new Promise((resolve) => setTimeout(resolve, 300));
}
