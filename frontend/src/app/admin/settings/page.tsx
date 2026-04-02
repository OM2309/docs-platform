"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, LogOut, Database, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { adminApi, auth as authApi } from "@/src/lib/api";
import { useAuthStore } from "@/src/store/auth";
import { cn } from "@/src/lib/utils";

type Toast = { type: "success" | "error"; msg: string } | null;

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [toast, setToast] = useState<Toast>(null);
  const [reindexing, setReindexing] = useState(false);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleReindex() {
    setReindexing(true);
    try {
      await adminApi.reindex();
      showToast("success", "Search index rebuilt successfully");
    } catch {
      showToast("error", "Reindex failed");
    } finally {
      setReindexing(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/admin/login");
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform configuration and admin tools</p>
      </div>

      {toast && (
        <div
          className={cn(
            "flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium border mb-6",
            toast.type === "success"
              ? "bg-green-500/10 border-green-500/30 text-green-600"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="space-y-4">
        {/* User info */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wider text-muted-foreground">
            Account
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-foreground">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium mt-1 inline-block capitalize">
                {user?.role}
              </span>
            </div>
          </div>
        </section>

        {/* Search */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-semibold text-foreground mb-1 text-sm">Full-Text Search Index</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Rebuild the PostgreSQL tsvector index for all published documents.
            Run this if search results seem outdated.
          </p>
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="flex items-center gap-2 text-sm font-medium border border-border rounded-lg px-4 py-2 hover:bg-muted transition-colors disabled:opacity-50"
          >
            {reindexing ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Database size={15} />
            )}
            Rebuild Search Index
          </button>
        </section>

        {/* Danger */}
        <section className="bg-card border border-destructive/30 rounded-xl p-6">
          <h2 className="font-semibold text-destructive mb-1 text-sm">Danger Zone</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Sign out of the admin panel on this device.
          </p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-medium bg-destructive/10 text-destructive border border-destructive/30 rounded-lg px-4 py-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </section>
      </div>
    </div>
  );
}
