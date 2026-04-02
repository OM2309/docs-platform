"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText, Globe, FileEdit, Users, Plus, ArrowRight,
  TrendingUp, Loader2, RefreshCw
} from "lucide-react";
import { adminApi } from "@/src/lib/api";
import type { Stats, Document } from "@/src/types";
import { formatRelative, cn } from "@/src/lib/utils";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [statsData, docsData] = await Promise.all([
        adminApi.getStats(),
        adminApi.listDocs({ page: 1, page_size: 5 }),
      ]);
      setStats(statsData);
      setRecentDocs(docsData.data || []);
    } catch {
      // silently fail — error states handled inline
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const statCards = stats
    ? [
        { label: "Total Documents", value: stats.total_docs, icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
        { label: "Published", value: stats.published_docs, icon: Globe, color: "text-green-500", bg: "bg-green-500/10" },
        { label: "Drafts", value: stats.draft_docs, icon: FileEdit, color: "text-amber-500", bg: "bg-amber-500/10" },
        { label: "Team Members", value: stats.total_users, icon: Users, color: "text-purple-500", bg: "bg-purple-500/10" },
      ]
    : [];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your documentation platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw size={15} className={cn(loading && "animate-spin")} />
          </button>
          <Link
            href="/admin/documents/new"
            className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            New Document
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statCards.map(({ label, value, icon: Icon, color, bg }) => (
              <div
                key={label}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors"
              >
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", bg)}>
                  <Icon size={18} className={color} />
                </div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[
              { href: "/admin/documents/new", icon: Plus, label: "Create document", desc: "Start writing new content" },
              { href: "/admin/documents", icon: FileText, label: "Manage documents", desc: "Edit, publish, or delete" },
              { href: "/docs", icon: Globe, label: "View public docs", desc: "See what users see", external: true },
            ].map(({ href, icon: Icon, label, desc, external }) => (
              <Link
                key={href}
                href={href}
                target={external ? "_blank" : undefined}
                className="group border border-border rounded-xl p-5 bg-card hover:border-primary/40 transition-colors flex items-center gap-4"
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                  <Icon size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>

          {/* Recent Documents */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-muted-foreground" />
                <h2 className="font-semibold text-sm text-foreground">Recent Documents</h2>
              </div>
              <Link
                href="/admin/documents"
                className="text-xs text-primary hover:underline font-medium"
              >
                View all
              </Link>
            </div>

            {recentDocs.length === 0 ? (
              <div className="py-12 text-center">
                <FileText size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No documents yet</p>
                <Link
                  href="/admin/documents/new"
                  className="text-xs text-primary hover:underline mt-1 inline-block"
                >
                  Create your first document →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/admin/documents/${doc.id}`}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {doc.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        /{doc.slug}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          doc.status === "published"
                            ? "bg-green-500/10 text-green-600"
                            : "bg-amber-500/10 text-amber-600"
                        )}
                      >
                        {doc.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(doc.updated_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
