import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ANI_URL = "https://graphql.anilist.co";
const outputPath = path.resolve("data", "source-metadata.json");
const userAgent = "MucCatalogSync/1.0 (+https://muctruyen.pages.dev; metadata-only)";

async function fetchJson(url, init = {}) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { Accept: "application/json", "User-Agent": userAgent, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      failure = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw failure;
}

const aniFields = `
  id siteUrl status chapters updatedAt genres averageScore popularity description countryOfOrigin
  title { romaji english native }
  coverImage { extraLarge large }
`;

async function loadAniListPage(page) {
  const query = `
    query MucMetadataSnapshot($page: Int!) {
      Page(page: $page, perPage: 25) {
        media(type: MANGA, isAdult: false, sort: [TRENDING_DESC, POPULARITY_DESC]) {
          ${aniFields}
        }
      }
    }
  `;
  const payload = await fetchJson(ANI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { page } }),
  });
  return payload.data?.Page?.media ?? [];
}

const aniPages = [];
for (let page = 1; page <= 4; page += 1) {
  aniPages.push(...await loadAniListPage(page));
  await new Promise((resolve) => setTimeout(resolve, 350));
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  anilist: [...new Map(aniPages.map((item) => [item.id, item])).values()],
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");
process.stdout.write(`Synced ${snapshot.anilist.length} AniList manga metadata records.\n`);
