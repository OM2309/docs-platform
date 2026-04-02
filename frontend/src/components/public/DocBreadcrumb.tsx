"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import type { Document, NavItem } from "@/src/types";

function findPath(nav: NavItem[], targetSlug: string, path: NavItem[] = []): NavItem[] | null {
  for (const item of nav) {
    const current = [...path, item];
    if (item.slug === targetSlug) return current;
    if (item.children?.length) {
      const found = findPath(item.children, targetSlug, current);
      if (found) return found;
    }
  }
  return null;
}

export default function DocBreadcrumb({
  doc,
  nav,
}: {
  doc: Document;
  nav: NavItem[];
}) {
  const path = findPath(nav, doc.slug) || [];

  if (path.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-2 flex-wrap">
      <Link href="/docs" className="hover:text-foreground transition-colors flex items-center gap-1">
        <Home size={13} />
        <span>Docs</span>
      </Link>
      {path.slice(0, -1).map((item) => (
        <span key={item.id} className="flex items-center gap-1">
          <ChevronRight size={13} className="opacity-50" />
          <Link href={`/docs/${item.slug}`} className="hover:text-foreground transition-colors">
            {item.title}
          </Link>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <ChevronRight size={13} className="opacity-50" />
        <span className="text-foreground font-medium">{doc.title}</span>
      </span>
    </nav>
  );
}
