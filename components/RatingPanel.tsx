import { ExternalLink, ShieldCheck, Star } from "lucide-react";
import { getExternalRating } from "../lib/external-ratings";
import { ratingConfidenceLabel } from "../lib/ratings";

export async function RatingPanel({
  titles,
  sourceUrl,
  fallbackScore,
  fallbackSource,
}: {
  titles: string[];
  sourceUrl: string;
  fallbackScore: number | null;
  fallbackSource: string | null;
}) {
  const rating = await getExternalRating(titles);
  const score = rating.score5 ?? fallbackScore;
  const scoreSource = rating.score5
    ? `${rating.isAggregate ? "Tổng hợp" : "Điểm nguồn"} · ${rating.sources.map((source) => source.sourceName).join(" + ")}`
    : fallbackSource;

  return (
    <aside className="score-panel" aria-label="Đánh giá và nguồn">
      <p className="section-kicker">{rating.isAggregate ? "Điểm tổng hợp" : "Điểm có nguồn"}</p>
      {score ? (
        <><div className="score-panel__number"><Star aria-hidden="true" />{score.toFixed(1)}<small>/5</small></div><p>{scoreSource}</p></>
      ) : (
        <><div className="score-panel__number score-panel__number--empty">—</div><p>Chưa đủ nguồn đánh giá đáng tin để tính điểm.</p></>
      )}
      <div className="confidence-row"><ShieldCheck aria-hidden="true" /><span>{rating.score5 ? `${ratingConfidenceLabel(rating.confidence)} · ${rating.voteCount.toLocaleString("vi-VN")} lượt chấm` : "Không biến thiếu dữ liệu thành 0 sao"}</span></div>
      {rating.sources.length ? (
        <ul className="rating-sources" aria-label="Nguồn tạo nên điểm">
          {rating.sources.map((source) => (
            <li key={source.sourceId}><a href={source.sourceUrl} target="_blank" rel="noreferrer"><span>{source.sourceName}</span><strong>{source.score5.toFixed(2)} · {source.voteCount.toLocaleString("vi-VN")}</strong><ExternalLink aria-hidden="true" /></a></li>
          ))}
        </ul>
      ) : null}
      <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> Xem nguồn OTruyen</a>
    </aside>
  );
}

export function RatingPanelFallback() {
  return (
    <aside className="score-panel score-panel--loading" aria-label="Đang tổng hợp đánh giá">
      <p className="section-kicker">Đang đối chiếu nguồn</p>
      <div className="score-panel__number score-panel__number--empty">···</div>
      <p>AniList và Kitsu đang được tải riêng để phần nội dung mở trước.</p>
    </aside>
  );
}
