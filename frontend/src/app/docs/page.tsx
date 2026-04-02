import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Documentation" };

async function getDocs() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/public/docs`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export default async function DocsIndexPage() {
  const docs = await getDocs();
  const rootDocs = docs.filter((d: { parent_id: string | null }) => !d.parent_id);

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      {/* Header */}
      <div className="mb-12">
        <div className="flex items-center gap-2 text-primary mb-3">
          <BookOpen size={18} />
          <span className="text-sm font-medium uppercase tracking-wide">Documentation</span>
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-4 tracking-tight">
          Welcome to DocFlow
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Browse our documentation to get started. Use the sidebar to navigate, or search for specific topics.
        </p>
      </div>

      {/* Docs Grid */}
      {docs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <BookOpen size={40} className="mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground font-medium">No documentation published yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Head to the{" "}
            <Link href="/admin" className="text-primary hover:underline">
              admin panel
            </Link>{" "}
            to create and publish documents.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {rootDocs.map((doc: {
            id: string;
            slug: string;
            title: string;
            description: string | null;
            tags: string[];
          }) => (
            <Link
              key={doc.id}
              href={`/docs/${doc.slug}`}
              className="group border border-border rounded-xl p-6 hover:border-primary/40 hover:bg-muted/30 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1.5">
                    {doc.title}
                  </h2>
                  {doc.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                      {doc.description}
                    </p>
                  )}
                  {doc.tags?.length > 0 && (
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {doc.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ArrowRight
                  size={16}
                  className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 mt-1"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
