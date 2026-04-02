"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save, Globe, EyeOff, ArrowLeft, Eye, Loader2,
  AlertCircle, CheckCircle2, Tag, X, ChevronDown
} from "lucide-react";
import { adminApi } from "@/src/lib/api";
import type { Document, CreateDocRequest, UpdateDocRequest } from "@/src/types";
import { slugify, cn } from "@/src/lib/utils";
import DocContent from "@/src/components/public/DocContent";

interface DocEditorProps {
  document?: Document;
  onSaved?: (doc: Document) => void;
}

type Toast = { type: "success" | "error"; message: string } | null;

export default function DocEditor({ document, onSaved }: DocEditorProps) {
  const router = useRouter();
  const isNew = !document;

  // Form state
  const [title, setTitle] = useState(document?.title || "");
  const [slug, setSlug] = useState(document?.slug || "");
  const [content, setContent] = useState(document?.content || "");
  const [description, setDescription] = useState(document?.description || "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(document?.tags || []);
  const [parentId, setParentId] = useState<string | null>(document?.parent_id || null);
  const [status, setStatus] = useState(document?.status || "draft");

  // UI state
  const [slugManual, setSlugManual] = useState(!isNew);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [parents, setParents] = useState<Document[]>([]);
  const [dirty, setDirty] = useState(false);

  // Auto-slug from title
  useEffect(() => {
    if (!slugManual && isNew) {
      setSlug(slugify(title));
    }
  }, [title, slugManual, isNew]);

  // Mark dirty when anything changes
  useEffect(() => {
    if (!isNew) setDirty(true);
  }, [title, slug, content, description, tags, parentId]);

  // Load parent docs for hierarchy selector
  useEffect(() => {
    adminApi.listDocs({ page_size: 100 }).then((res) => {
      const filtered = (res.data || []).filter((d) => d.id !== document?.id);
      setParents(filtered);
    }).catch(() => {});
  }, [document?.id]);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  const handleSave = useCallback(async () => {
    if (!title.trim() || !slug.trim()) {
      showToast("error", "Title and slug are required");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const payload: CreateDocRequest = {
          title: title.trim(),
          slug: slug.trim(),
          content,
          description: description.trim() || undefined,
          tags,
          parent_id: parentId || null,
          position: 0,
        };
        const created = await adminApi.createDoc(payload);
        showToast("success", "Document created!");
        setDirty(false);
        router.replace(`/admin/documents/${created.id}`);
        onSaved?.(created);
      } else {
        const payload: UpdateDocRequest = {
          title: title.trim(),
          slug: slug.trim(),
          content,
          description: description.trim() || undefined,
          tags,
          parent_id: parentId || null,
        };
        const updated = await adminApi.updateDoc(document!.id, payload);
        showToast("success", "Changes saved!");
        setDirty(false);
        setStatus(updated.status);
        onSaved?.(updated);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  }, [title, slug, content, description, tags, parentId, isNew, document, router, onSaved]);

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  async function handlePublish() {
    if (!document?.id) return;
    setPublishing(true);
    try {
      if (status === "published") {
        await adminApi.unpublishDoc(document.id);
        setStatus("draft");
        showToast("success", "Document unpublished");
      } else {
        if (dirty) await handleSave();
        await adminApi.publishDoc(document.id);
        setStatus("published");
        showToast("success", "Document published!");
      }
    } catch {
      showToast("error", "Action failed");
    } finally {
      setPublishing(false);
    }
  }

  function addTag(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const t = tagInput.trim().toLowerCase().replace(/,/g, "");
      if (t && !tags.includes(t) && tags.length < 10) {
        setTags([...tags, t]);
      }
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Toolbar */}
      <div className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center gap-3 px-4 lg:px-6 h-14">
          <Link
            href="/admin/documents"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Documents</span>
          </Link>

          <div className="h-4 w-px bg-border" />

          {/* Status badge */}
          <span
            className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium",
              status === "published"
                ? "bg-green-500/10 text-green-600"
                : "bg-amber-500/10 text-amber-600"
            )}
          >
            {isNew ? "New" : status}
            {dirty && !isNew && " •"}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Preview toggle */}
            <button
              onClick={() => setPreview(!preview)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                preview
                  ? "bg-muted text-foreground border-border"
                  : "text-muted-foreground border-transparent hover:border-border hover:bg-muted"
              )}
            >
              <Eye size={14} />
              <span className="hidden sm:inline">Preview</span>
            </button>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors text-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span className="hidden sm:inline">Save</span>
            </button>

            {/* Publish / Unpublish */}
            {!isNew && (
              <button
                onClick={handlePublish}
                disabled={publishing || saving}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
                  status === "published"
                    ? "bg-muted text-muted-foreground hover:text-foreground border border-border"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {publishing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : status === "published" ? (
                  <EyeOff size={14} />
                ) : (
                  <Globe size={14} />
                )}
                <span className="hidden sm:inline">
                  {status === "published" ? "Unpublish" : "Publish"}
                </span>
              </button>
            )}

            {/* View live */}
            {status === "published" && document?.slug && (
              <Link
                href={`/docs/${document.slug}`}
                target="_blank"
                className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                title="View live"
              >
                <Eye size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border animate-fade-in",
            toast.type === "success"
              ? "bg-card border-green-500/30 text-green-600"
              : "bg-card border-destructive/30 text-destructive"
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={15} />
          ) : (
            <AlertCircle size={15} />
          )}
          {toast.message}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Editor panel */}
        <div className={cn("flex-1 overflow-y-auto", preview && "hidden lg:block lg:w-1/2 lg:flex-none")}>
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {/* Title */}
            <div>
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
                placeholder="Document title…"
                className="w-full text-3xl font-bold bg-transparent text-foreground placeholder:text-muted-foreground/50 border-none outline-none resize-none"
              />
            </div>

            {/* Slug */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-mono shrink-0">/docs/</span>
              <input
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugManual(true); setDirty(true); }}
                placeholder="url-slug"
                className="flex-1 text-sm font-mono bg-muted border border-border rounded-md px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Description
              </label>
              <input
                value={description}
                onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
                placeholder="Brief description of this document…"
                className="w-full text-sm bg-muted border border-border rounded-lg px-3.5 py-2.5 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted border border-border rounded-lg min-h-[42px]">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 text-xs bg-background border border-border px-2 py-1 rounded-md text-foreground"
                  >
                    <Tag size={10} className="opacity-50" />
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-muted-foreground hover:text-foreground ml-0.5"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={addTag}
                  placeholder={tags.length === 0 ? "Add tags (press Enter)…" : ""}
                  className="flex-1 min-w-[100px] text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Parent */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Parent Document
              </label>
              <div className="relative">
                <select
                  value={parentId || ""}
                  onChange={(e) => { setParentId(e.target.value || null); setDirty(true); }}
                  className="w-full appearance-none text-sm bg-muted border border-border rounded-lg px-3.5 py-2.5 pr-9 text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                >
                  <option value="">None (root level)</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Content (Markdown)
              </label>
              <textarea
                value={content}
                onChange={(e) => { setContent(e.target.value); setDirty(true); }}
                placeholder={`# Getting Started\n\nWrite your documentation in Markdown…\n\n## Section\n\nText here.`}
                className="w-full text-sm font-mono bg-muted border border-border rounded-lg px-4 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none leading-relaxed min-h-[400px]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Supports GitHub Flavored Markdown (GFM) — tables, task lists, code blocks, etc.
              </p>
            </div>
          </div>
        </div>

        {/* Preview panel */}
        {preview && (
          <div className="flex-1 border-l border-border overflow-y-auto bg-background">
            <div className="max-w-3xl mx-auto px-8 py-10">
              {title && (
                <h1 className="text-4xl font-bold text-foreground mb-6">{title}</h1>
              )}
              <DocContent content={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
