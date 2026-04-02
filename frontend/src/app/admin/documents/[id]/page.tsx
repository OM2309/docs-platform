"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertCircle, History } from "lucide-react";
import { adminApi } from "@/src/lib/api";
import type { Document, DocumentVersion } from "@/src/types";
import DocEditor from "@/src/components/admin/DocEditor";
import { formatDate, cn } from "@/src/lib/utils";

export default function EditDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  useEffect(() => {
    adminApi.getDoc(id)
      .then(setDoc)
      .catch(() => setError("Document not found or access denied"))
      .finally(() => setLoading(false));
  }, [id]);

  async function loadVersions() {
    setVersionsLoading(true);
    try {
      const res = await adminApi.getVersions(id);
      setVersions(res.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  function toggleVersions() {
    setShowVersions(!showVersions);
    if (!showVersions && versions.length === 0) {
      loadVersions();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
        <AlertCircle size={32} className="text-destructive/60" />
        <p className="text-foreground font-medium">{error || "Document not found"}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <DocEditor document={doc} onSaved={setDoc} />

      {/* Version History Panel */}
      <div className="fixed bottom-6 left-6 z-40">
        <button
          onClick={toggleVersions}
          className="flex items-center gap-2 text-xs bg-card border border-border rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground shadow-sm hover:shadow-md transition-all"
        >
          <History size={13} />
          Version History
        </button>
      </div>

      {showVersions && (
        <div className="fixed bottom-16 left-6 z-40 w-72 bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Version History</h3>
            <button
              onClick={() => setShowVersions(false)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Close
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {versionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No versions yet. Save the document to create a snapshot.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {versions.map((v) => (
                  <div key={v.id} className="px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">v{v.version}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{v.title}</p>
                    <p className="text-xs text-muted-foreground/60">by {v.author_name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
