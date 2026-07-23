export type AutoTag = { slug: string; name: string; origin: "rule"; confidence: number };

const tagRules: Array<{ slug: string; name: string; confidence: number; terms: string[] }> = [
  { slug: "mood-intense", name: "Căng thẳng", confidence: 0.88, terms: ["action", "adventure", "sports", "thriller", "martial-arts"] },
  { slug: "mood-dark", name: "U tối", confidence: 0.9, terms: ["horror", "tragedy", "psychological", "survival", "gore"] },
  { slug: "mood-healing", name: "Chữa lành", confidence: 0.82, terms: ["slice-of-life", "cooking", "family", "iyashikei"] },
  { slug: "mood-clever", name: "Đấu trí", confidence: 0.84, terms: ["mystery", "detective", "psychological", "strategy"] },
  { slug: "pace-fast", name: "Nhịp nhanh", confidence: 0.78, terms: ["action", "adventure", "sports", "thriller"] },
  { slug: "format-webtoon", name: "Webtoon", confidence: 0.96, terms: ["webtoon", "manhwa", "truyen-mau"] },
  { slug: "format-manga", name: "Manga", confidence: 0.9, terms: ["manga"] },
  { slug: "format-manhua", name: "Manhua", confidence: 0.9, terms: ["manhua"] },
];

export function deriveAutoTags(sourceSlugs: string[], title = "", synopsis = ""): AutoTag[] {
  const haystack = `${sourceSlugs.join(" ")} ${title} ${synopsis}`.toLocaleLowerCase("vi");
  return tagRules
    .filter((rule) => rule.terms.some((term) => haystack.includes(term)))
    .map(({ slug, name, confidence }) => ({ slug, name, confidence, origin: "rule" as const }));
}

export function inferContentRating(sourceSlugs: string[]) {
  const values = new Set(sourceSlugs);
  if (["adult", "18+", "smut", "hentai"].some((slug) => values.has(slug))) return "explicit" as const;
  if (["mature", "gore"].some((slug) => values.has(slug))) return "mature" as const;
  if (["ecchi", "suggestive"].some((slug) => values.has(slug))) return "suggestive" as const;
  return "safe" as const;
}
