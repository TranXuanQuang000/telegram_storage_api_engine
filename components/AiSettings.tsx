"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, BookOpenCheck, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Send, ShieldCheck, Sparkles, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { StoryCardData } from "../lib/catalog";
import { StoryCover } from "./StoryCover";
import { StoryPreviewLink } from "./StoryPreviewLink";

type Provider = "openai-compatible" | "anthropic" | "gemini";

const defaults: Record<Provider, string> = { "openai-compatible": "gpt-4.1-mini", anthropic: "claude-3-5-haiku-latest", gemini: "gemini-2.0-flash" };

type AiRecommendation = {
  story: StoryCardData & {
    reviewSignal?: {
      reviewCount: number;
      positiveReviewRatio: number | null;
      helpfulApprovalRatio: number | null;
      helpfulVotes: number;
    } | null;
  };
  reason: string;
  caveat: string | null;
};

type ResolvedReference = { title: string; slug: string; coverUrl: string | null };

export function AiSettings() {
  const [provider, setProvider] = useState<Provider>("openai-compatible");
  const [model, setModel] = useState(defaults["openai-compatible"]);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [query, setQuery] = useState("Tìm truyện có nội dung giống Toàn Tri Độc Giả nhưng ít hài hơn.");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [answer, setAnswer] = useState("");
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([]);
  const [resolvedReference, setResolvedReference] = useState<ResolvedReference | null>(null);

  useEffect(() => {
    const savedProvider = sessionStorage.getItem("muc:ai-provider") as Provider | null;
    const savedKey = sessionStorage.getItem("muc:ai-key") ?? "";
    const savedModel = sessionStorage.getItem("muc:ai-model") ?? "";
    queueMicrotask(() => {
      if (savedProvider && savedProvider in defaults) setProvider(savedProvider);
      if (savedKey) setKey(savedKey);
      if (savedModel) setModel(savedModel);
    });
  }, []);

  function changeProvider(value: Provider) { setProvider(value); setModel(defaults[value]); setAnswer(""); setRecommendations([]); setResolvedReference(null); setState("idle"); }
  function saveSession() { sessionStorage.setItem("muc:ai-provider", provider); sessionStorage.setItem("muc:ai-model", model); sessionStorage.setItem("muc:ai-key", key); }
  function clearKey() { sessionStorage.removeItem("muc:ai-key"); setKey(""); setAnswer(""); setRecommendations([]); setResolvedReference(null); setState("idle"); }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!key.trim() || !query.trim()) return;
    saveSession(); setState("loading"); setAnswer(""); setRecommendations([]); setResolvedReference(null);
    try {
      let history: Array<{ title: string; storySlug?: string }> = [];
      if (includeHistory) {
        try {
          const records = JSON.parse(localStorage.getItem("muc:history") ?? "[]") as Array<{ storyTitle?: string; storySlug?: string }>;
          history = records.filter((item) => item.storyTitle).slice(0, 8).map((item) => ({ title: item.storyTitle!, storySlug: item.storySlug }));
        } catch { /* history is optional */ }
      }
      const response = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-AI-Provider": provider, "X-AI-Key": key },
        body: JSON.stringify({ query, history, model }),
      });
      const data = await response.json() as { answer?: string; error?: string; recommendations?: AiRecommendation[]; resolvedReference?: ResolvedReference | null };
      if (!response.ok) throw new Error(data.error ?? "Không gọi được model");
      setResolvedReference(data.resolvedReference ?? null);
      setRecommendations(data.recommendations ?? []);
      setAnswer(data.answer ?? "Model chưa trả về lời giải thích."); setState("done");
    } catch (error) { setAnswer(error instanceof Error ? error.message : "Không gọi được model"); setState("error"); }
  }

  return (
    <div className="ai-settings-grid">
      <section className="ai-config-card">
        <div className="ai-config-card__title"><KeyRound aria-hidden="true" /><div><p className="section-kicker">SECURE LINK / SESSION ONLY</p><h2>Kết nối model.</h2></div></div>
        <label><span>Nhà cung cấp</span><select value={provider} onChange={(event) => changeProvider(event.target.value as Provider)}><option value="openai-compatible">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option></select></label>
        <label><span>Model</span><input value={model} onChange={(event) => setModel(event.target.value)} maxLength={80} /></label>
        <label><span>API key</span><div className="key-input"><input type={showKey ? "text" : "password"} value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" placeholder="Dán key cho phiên này" /><button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "Ẩn API key" : "Hiện API key"}>{showKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></label>
        <div className="key-actions"><button type="button" onClick={saveSession} disabled={!key}><CheckCircle2 aria-hidden="true" /> Giữ trong phiên</button><button type="button" onClick={clearKey}><Trash2 aria-hidden="true" /> Xóa ngay</button></div>
        <label className="history-consent">
          <input type="checkbox" checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)} />
          <BookOpenCheck aria-hidden="true" />
          <span><strong>Dùng tối đa 8 tựa trong lịch sử</strong><small>Chỉ gửi tên truyện khi bạn hỏi; không gửi tiến độ hay ảnh.</small></span>
        </label>
        <div className="privacy-box"><ShieldCheck aria-hidden="true" /><p><strong>Không lưu vào D1/localStorage.</strong><br />Key nằm trong `sessionStorage`, biến mất khi bạn đóng tab. Proxy không ghi request hay Authorization vào log ứng dụng.</p></div>
      </section>
      <section className="ai-playground">
        <div><p className="section-kicker">QUERY TERMINAL / VERIFIED CATALOG</p><h2>Nói gu. Khóa tín hiệu.</h2><p>Mực lọc ràng buộc trước, rồi xếp lại bằng nội dung, điểm cộng đồng và review hữu ích. Kết quả luôn là truyện thật có bìa và nút mở.</p></div>
        <div className="ai-examples" aria-label="Ví dụ câu hỏi">
          <button type="button" onClick={() => setQuery("Tìm truyện giống Solo Leveling, có tăng tiến sức mạnh rõ nhưng nhân vật chính bớt lạnh lùng.")}>Giống Solo Leveling</button>
          <button type="button" onClick={() => setQuery("Tìm truyện có nội dung tương tự Blue Lock nhưng là môn thể thao khác.")}>Tương tự Blue Lock</button>
          <button type="button" onClick={() => setQuery("Dựa trên lịch sử của tôi, chọn truyện đã hoàn thành và ít romance.")}>Theo lịch sử đọc</button>
        </div>
        <form onSubmit={ask}><textarea value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} /><button className="button button--ink" type="submit" disabled={!key || state === "loading"}>{state === "loading" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />} Hỏi AI</button></form>
        <div className={`ai-answer ai-answer--${state}`} aria-live="polite">{state === "idle" ? <><Sparkles aria-hidden="true" /><p>Nhập key để thử. Không có key, bộ lọc nâng cao và gợi ý quy tắc vẫn hoạt động bình thường.</p></> : state === "loading" ? <p>Đang lọc điều kiện, đối chiếu điểm và review cộng đồng rồi mới hỏi model…</p> : <div>{resolvedReference ? <Link className="ai-reference-preview" href={`/story/${resolvedReference.slug}`}><StoryCover src={resolvedReference.coverUrl} title={resolvedReference.title} /><small>Đã nhận diện truyện mẫu<br /><strong>{resolvedReference.title}</strong></small></Link> : null}<p>{answer}</p></div>}</div>
        {state === "done" && recommendations.length ? (
          <div className="ai-recommendations" aria-label="Truyện được AI đề xuất">
            {recommendations.map(({ story, reason, caveat }, index) => (
              <article className="ai-recommendation-card" key={story.id}>
                <StoryPreviewLink className="ai-recommendation-card__cover" story={story} aria-label={`Mở ${story.title}`}>
                  <StoryCover src={story.coverUrl} title={story.title} />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </StoryPreviewLink>
                <div className="ai-recommendation-card__body">
                  <p className="section-kicker">{story.genres.slice(0, 2).join(" · ") || "Truyện tranh"}</p>
                  <h3><StoryPreviewLink story={story}>{story.title}</StoryPreviewLink></h3>
                  <p>{reason}</p>
                  {caveat ? <small>{caveat}</small> : null}
                  <div className="ai-recommendation-card__meta">
                    {story.score ? <span><Star aria-hidden="true" /> {story.score.toFixed(1)}/5</span> : null}
                    {story.reviewSignal?.positiveReviewRatio !== null && story.reviewSignal?.positiveReviewRatio !== undefined ? <span>{Math.round(story.reviewSignal.positiveReviewRatio * 100)}% review tích cực</span> : null}
                    {story.reviewSignal?.helpfulVotes ? <span>{story.reviewSignal.helpfulVotes.toLocaleString("vi-VN")} lượt hữu ích</span> : null}
                    {story.latestChapter ? <span>Ch. {story.latestChapter}</span> : null}
                  </div>
                  <div className="ai-recommendation-card__actions">
                    <StoryPreviewLink story={story}>Xem truyện <ArrowRight aria-hidden="true" /></StoryPreviewLink>
                    {story.latestChapterId ? (
                      <Link href={`/read/${story.latestChapterId}?story=${encodeURIComponent(story.slug)}&title=${encodeURIComponent(story.title)}&cover=${encodeURIComponent(story.coverUrl ?? "")}`}>
                        <BookOpen aria-hidden="true" /> Đọc ngay
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
