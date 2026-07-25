"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, User, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const [user, setUser] = useState<{ id: string; username: string; display_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: unknown) => {
        const payload = data as { user?: { id: string; username: string; display_name: string } | null };
        if (payload.user) {
          setUser(payload.user);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.refresh();
    window.location.href = "/";
  };

  if (loading) return <div className="w-8 h-8 rounded-full bg-slate-800 animate-pulse" />;

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="text-xs font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-800/80">
          <User size={15} /> Đăng nhập
        </Link>
        <Link href="/register" className="text-xs font-medium bg-lime-400/10 text-lime-400 border border-lime-400/30 hover:bg-lime-400/20 transition-all flex items-center gap-1 px-2.5 py-1.5 rounded-lg">
          <UserPlus size={15} /> Đăng ký
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-lime-400">{user.display_name}</span>
      <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition-colors p-1" title="Đăng xuất">
        <LogOut size={16} />
      </button>
    </div>
  );
}
