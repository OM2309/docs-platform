"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Search, FileText, Globe, FileEdit, Trash2,
  Eye, EyeOff, Loader2, ChevronLeft, ChevronRight,
  MoreHorizontal, RefreshCw
} from "lucide-react";
import { adminApi } from "@/src/lib/api";
import type { Document } from "@/src/types";
import { formatRelative, cn } from "@/src/lib/utils";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
];

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listDocs({ page, page_size: PAGE_SIZE, status });
      setDocs(res.data || []);
      setTotal(res.total);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function togglePublish(doc: Document) {
    setActionLoading(doc.id);
    try {
      if (doc.status === "published") {
        await adminApi.unpublishDoc(doc.id);
      } else {
        await adminApi.publishDoc(doc.id);
      }
      await loadDocs();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }
    setActionLoading(id);
    try {
      await adminApi.deleteDoc(id);
      await loadDocs();
    } finally {
      setActionLoading(null);
      setDeleteConfirm(null);
    }
  }

  const filtered = search
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          d.slug.toLowerCase().includes(search.toLowerCase())
      )
    : docs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} total documents</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDocs}
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title or slug…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md font-medium transition-colors",
                status === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <FileText size={36} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {search ? "No documents match your filter" : "No documents yet"}
            </p>
            {!search && (
              <Link
                href="/admin/documents/new"
                className="text-xs text-primary hover:underline mt-2 inline-block"
              >
                Create your first document →
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr,auto,auto,auto] gap-4 px-6 py-3 border-b border-border bg-muted/40">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Document
              </span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Updated
              </span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Actions
              </span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {filtered.map((doc) => (
                <div
                  key={doc.id}
                  className="grid grid-cols-[1fr,auto,auto,auto] gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group"
                >
                  {/* Title + slug */}
                  <div className="min-w-0">
                    <Link
                      href={`/admin/documents/${doc.id}`}
                      className="font-medium text-sm text-foreground hover:text-primary transition-colors truncate block"
                    >
                      {doc.title}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">
                      /{doc.slug}
                    </p>
                    {doc.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {doc.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <span
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap",
                      doc.status === "published"
                        ? "bg-green-500/10 text-green-600"
                        : "bg-amber-500/10 text-amber-600"
                    )}
                  >
                    {doc.status === "published" ? (
                      <span className="flex items-center gap-1">
                        <Globe size={10} />
                        Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <FileEdit size={10} />
                        Draft
                      </span>
                    )}
                  </span>

                  {/* Updated at */}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelative(doc.updated_at)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Edit */}
                    <Link
                      href={`/admin/documents/${doc.id}`}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Edit"
                    >
                      <FileEdit size={14} />
                    </Link>

                    {/* View public */}
                    {doc.status === "published" && (
                      <Link
                        href={`/docs/${doc.slug}`}
                        target="_blank"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="View public"
                      >
                        <Eye size={14} />
                      </Link>
                    )}

                    {/* Publish / unpublish */}
                    <button
                      onClick={() => togglePublish(doc)}
                      disabled={actionLoading === doc.id}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        doc.status === "published"
                          ? "text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                          : "text-muted-foreground hover:text-green-600 hover:bg-green-500/10"
                      )}
                      title={doc.status === "published" ? "Unpublish" : "Publish"}
                    >
                      {actionLoading === doc.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : doc.status === "published" ? (
                        <EyeOff size={14} />
                      ) : (
                        <Globe size={14} />
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={actionLoading === doc.id}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        deleteConfirm === doc.id
                          ? "text-destructive bg-destructive/10"
                          : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      )}
                      title={deleteConfirm === doc.id ? "Click again to confirm" : "Delete"}
                    >
                      {actionLoading === doc.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm text-muted-foreground px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
