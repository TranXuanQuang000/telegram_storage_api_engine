export function normalizeTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[đĐ]/g, "d")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/\b(truyen tranh|manga|manhwa|manhua|full hd|full)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleSimilarity(left: string, right: string) {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a))) return 0.92;
  const first = new Set(a.split(" "));
  const second = new Set(b.split(" "));
  const intersection = [...first].filter((token) => second.has(token)).length;
  const tokenScore = (2 * intersection) / (first.size + second.size);
  const editScore = 1 - damerauLevenshtein(a, b) / Math.max(a.length, b.length);
  return Math.max(tokenScore, editScore * .9);
}

export function extractReferenceTitle(query: string): string | null {
  const normalized = query.replace(/\s+/g, " ").trim();
  const match = normalized.match(/(?:giống|tương tự|na ná|như)\s+(?:với\s+)?(?:truyện\s+)?[“"'‘]?(.{2,100})/i);
  if (!match?.[1]) return null;
  const candidate = match[1]
    .replace(/[”"'’].*$/, "")
    .replace(/\s+(?:nhưng|mà|với|có|theo|thể loại|nội dung|nhịp|và)\b.*$/i, "")
    .replace(/[.?!,;:|]+$/, "")
    .trim();
  return candidate.length >= 2 ? candidate.slice(0, 80) : null;
}

function damerauLevenshtein(left: string, right: string) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + cost);
      }
    }
  }
  return matrix[left.length][right.length];
}
