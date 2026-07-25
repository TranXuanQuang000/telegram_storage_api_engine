"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function safeDestination(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/reader-access", { signal: controller.signal, cache: "no-store" })
      .then(async (response): Promise<{ inviteRequired?: boolean; registrationOpen?: boolean } | null> =>
        response.ok ? await response.json() as { inviteRequired?: boolean; registrationOpen?: boolean } : null)
      .then((access) => {
        if (!access) return;
        setInviteRequired(Boolean(access.inviteRequired));
        setRegistrationOpen(access.registrationOpen !== false);
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password, inviteCode: inviteCode || undefined }),
      });

      let data: Record<string, string> = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("Phản hồi từ máy chủ không đúng định dạng JSON");
      }

      if (!res.ok) {
        throw new Error(data.error || "Đăng ký thất bại");
      }

      // Tự động chuyển hướng người dùng sang trang đích hoặc trang chủ /
      const destination = safeDestination(searchParams?.get("from") || searchParams?.get("redirect"));
      window.location.href = destination;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi kết nối");
      setLoading(false);
    }
  };

  const loginLink = searchParams?.get("from") 
    ? `/login?from=${encodeURIComponent(searchParams.get("from")!)}`
    : "/login";

  return (
    <main className="max-w-md mx-auto mt-20 p-6 bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-800">
      <h1 className="text-2xl font-bold mb-6 text-center">Đăng ký tài khoản</h1>
      {!registrationOpen ? (
        <div className="bg-amber-500/10 text-amber-300 p-3 rounded-lg mb-4 text-sm border border-amber-500/20">
          Đăng ký bằng mã mời đang tạm đóng. Tài khoản hiện có vẫn có thể đăng nhập.
        </div>
      ) : null}
      {error && (
        <div className="bg-red-500/10 text-red-400 p-3 rounded-lg mb-4 text-sm border border-red-500/20">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tên đăng nhập</label>
          <input
            type="text"
            required
            pattern="^[a-zA-Z0-9_-]{3,20}$"
            title="3-20 ký tự, chỉ gồm chữ, số, gạch ngang, gạch dưới"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800/80 border border-slate-700 rounded-lg focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tên hiển thị (tuỳ chọn)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800/80 border border-slate-700 rounded-lg focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Mật khẩu</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800/80 border border-slate-700 rounded-lg focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Xác nhận mật khẩu</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800/80 border border-slate-700 rounded-lg focus:outline-none focus:border-green-500"
          />
        </div>
        {inviteRequired ? (
          <div>
            <label className="block text-sm font-medium mb-1">Mã mời</label>
            <input
              type="password"
              required
              autoComplete="off"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              className="w-full px-4 py-2 bg-slate-800/80 border border-slate-700 rounded-lg focus:outline-none focus:border-green-500"
            />
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading || !registrationOpen}
          className="button button--ink w-full justify-center !mt-6"
        >
          {loading ? "Đang xử lý..." : "Đăng ký"}
        </button>
      </form>
      <div className="mt-4 text-center text-sm text-slate-400">
        Đã có tài khoản?{" "}
        <Link href={loginLink} className="text-green-400 hover:underline">
          Đăng nhập
        </Link>
      </div>
    </main>
  );
}
