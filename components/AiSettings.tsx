"use client";

import { CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type Provider = "openai-compatible" | "anthropic" | "gemini";

const defaults: Record<Provider, string> = { "openai-compatible": "gpt-4.1-mini", anthropic: "claude-3-5-haiku-latest", gemini: "gemini-2.0-flash" };

export function AiSettings() {
  const [provider, setProvider] = useState<Provider>("openai-compatible");
  const [model, setModel] = useState(defaults["openai-compatible"]);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [query, setQuery] = useState("Tìm manhwa trả thù, nữ chính tỉnh táo, ít romance và có nhịp nhanh.");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [answer, setAnswer] = useState("");

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

  function changeProvider(value: Provider) { setProvider(value); setModel(defaults[value]); setAnswer(""); setState("idle"); }
  function saveSession() { sessionStorage.setItem("muc:ai-provider", provider); sessionStorage.setItem("muc:ai-model", model); sessionStorage.setItem("muc:ai-key", key); }
  function clearKey() { sessionStorage.removeItem("muc:ai-key"); setKey(""); setAnswer(""); setState("idle"); }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!key.trim() || !query.trim()) return;
    saveSession(); setState("loading"); setAnswer("");
    try {
      const catalog = await fetch("/api/catalog").then((response) => response.json()) as { items: Array<{ id: string }> };
      const response = await fetch("/api/ai/recommend", { method: "POST", headers: { "Content-Type": "application/json", "X-AI-Provider": provider, "X-AI-Key": key }, body: JSON.stringify({ query, candidateIds: catalog.items.slice(0, 18).map((item) => item.id), model }) });
      const data = await response.json() as { answer?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Không gọi được model");
      setAnswer(data.answer ?? "Model chưa trả về lời giải thích."); setState("done");
    } catch (error) { setAnswer(error instanceof Error ? error.message : "Không gọi được model"); setState("error"); }
  }

  return (
    <div className="ai-settings-grid">
      <section className="ai-config-card">
        <div className="ai-config-card__title"><KeyRound aria-hidden="true" /><div><p className="section-kicker">BYOK · chỉ trong phiên</p><h2>Chìa khóa của bạn</h2></div></div>
        <label><span>Nhà cung cấp</span><select value={provider} onChange={(event) => changeProvider(event.target.value as Provider)}><option value="openai-compatible">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option></select></label>
        <label><span>Model</span><input value={model} onChange={(event) => setModel(event.target.value)} maxLength={80} /></label>
        <label><span>API key</span><div className="key-input"><input type={showKey ? "text" : "password"} value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" placeholder="Dán key cho phiên này" /><button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "Ẩn API key" : "Hiện API key"}>{showKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></label>
        <div className="key-actions"><button type="button" onClick={saveSession} disabled={!key}><CheckCircle2 aria-hidden="true" /> Giữ trong phiên</button><button type="button" onClick={clearKey}><Trash2 aria-hidden="true" /> Xóa ngay</button></div>
        <div className="privacy-box"><ShieldCheck aria-hidden="true" /><p><strong>Không lưu vào D1/localStorage.</strong><br />Key nằm trong `sessionStorage`, biến mất khi bạn đóng tab. Proxy không ghi request hay Authorization vào log ứng dụng.</p></div>
      </section>
      <section className="ai-playground">
        <div><p className="section-kicker">Thử trên mẻ truyện hiện tại</p><h2>Hỏi bằng lời bạn vẫn nói.</h2><p>Model chỉ được chọn trong danh sách ứng viên Mực đã lấy từ nguồn. Nó không được bịa thêm tựa truyện hay tự chấm điểm.</p></div>
        <form onSubmit={ask}><textarea value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} /><button className="button button--ink" type="submit" disabled={!key || state === "loading"}>{state === "loading" ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />} Hỏi AI</button></form>
        <div className={`ai-answer ai-answer--${state}`} aria-live="polite">{state === "idle" ? <><Sparkles aria-hidden="true" /><p>Nhập key để thử. Không có key, bộ lọc nâng cao và gợi ý quy tắc vẫn hoạt động bình thường.</p></> : state === "loading" ? <p>Đang gửi một bản mô tả gọn cùng danh sách ứng viên…</p> : <p>{answer}</p>}</div>
      </section>
    </div>
  );
}
