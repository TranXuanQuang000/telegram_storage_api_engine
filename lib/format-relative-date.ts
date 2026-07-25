export function formatRelativeDate(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "chưa rõ";
  const diff = Date.now() - time;
  const days = Math.max(0, Math.round(diff / 86_400_000));
  if (days === 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  if (days < 30) return `${days} ngày trước`;
  const months = Math.round(days / 30);
  return `${months} tháng trước`;
}
