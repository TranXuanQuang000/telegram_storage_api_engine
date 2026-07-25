"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function safeDestination(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      let data: Record<string, string> = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("Phản hồi từ máy chủ không đúng định dạng JSON");
      }

      if (!res.ok) {
        throw new Error(data.error || "Đăng nhập thất bại");
      }

      // Tự động chuyển hướng về trang đích (hoặc trang chủ /)
      const destination = safeDestination(searchParams?.get("from") || searchParams?.get("redirect"));
      window.location.href = destination;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi kết nối");
      setLoading(false);
    }
  };

  const registerLink = searchParams?.get("from") 
    ? `/register?from=${encodeURIComponent(searchParams.get("from")!)}`
    : "/register";

  return (
    <main className="max-w-md mx-auto mt-20 p-6 bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-800">
      <h1 className="text-2xl font-bold mb-6 text-center">Đăng nhập</h1>
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
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
        <button
          type="submit"
          disabled={loading}
          className="button button--ink w-full justify-center !mt-6"
        >
          {loading ? "Đang xử lý..." : "Đăng nhập"}
        </button>
      </form>
      <div className="mt-4 text-center text-sm text-slate-400">
        Chưa có tài khoản?{" "}
        <Link href={registerLink} className="text-green-400 hover:underline">
          Đăng ký ngay
        </Link>
      </div>
    </main>
  );
}
