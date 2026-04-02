import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DocContent from "@/src/components/public/DocContent";
import DocBreadcrumb from "@/src/components/public/DocBreadcrumb";
import type { Document } from "@/src/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function getDoc(slug: string): Promise<Document | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/docs/${slug}`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getNav() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/nav`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { nav: [] };
    return res.json();
  } catch {
    return { nav: [] };
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const doc = await getDoc(params.slug);
  if (!doc) return { title: "Not Found" };

  return {
    title: doc.title,
    description: doc.description ?? undefined,
  };
}

export default async function DocPage({
  params,
}: {
  params: { slug: string };
}) {
  const [doc, navData] = await Promise.all([
    getDoc(params.slug),
    getNav(),
  ]);

  if (!doc) notFound();

  return (
    <article className="max-w-3xl mx-auto px-8 py-10 animate-fade-in">
      {/* Breadcrumb */}
      <DocBreadcrumb doc={doc} nav={navData.nav} />

      {/* Header */}
      <header className="mb-8 mt-4">
        <h1 className="text-4xl font-bold text-foreground tracking-tight mb-3">
          {doc.title}
        </h1>
        {doc.description && (
          <p className="text-lg text-muted-foreground leading-relaxed">
            {doc.description}
          </p>
        )}
        {doc.tags?.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-4">
            {doc.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
          {doc.author_name && <span>By {doc.author_name}</span>}
          {doc.published_at && (
            <span>
              Published{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }).format(new Date(doc.published_at))}
            </span>
          )}
          {doc.updated_at && (
            <span>
              Updated{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date(doc.updated_at))}
            </span>
          )}
        </div>
      </header>

      {/* Content */}
      <DocContent content={doc.content} />
    </article>
  );
}
