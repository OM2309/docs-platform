"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FileText, Loader2 } from "lucide-react";
import { publicApi } from "@/src/lib/api";
import type { NavItem } from "@/src/types";
import { cn } from "@/src/lib/utils";

export default function PublicSidebar() {
  const [nav, setNav] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    publicApi.getNav()
      .then((data) => setNav(data.nav || []))
      .catch(() => setNav([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <nav className="p-3">
      <div className="px-2 py-2 mb-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Contents
        </span>
      </div>

      {nav.length === 0 ? (
        <p className="text-xs text-muted-foreground px-2 py-4">No pages published yet.</p>
      ) : (
        <NavTree items={nav} pathname={pathname} depth={0} />
      )}
    </nav>
  );
}

function NavTree({
  items,
  pathname,
  depth,
}: {
  items: NavItem[];
  pathname: string;
  depth: number;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <NavTreeItem key={item.id} item={item} pathname={pathname} depth={depth} />
      ))}
    </ul>
  );
}

function NavTreeItem({
  item,
  pathname,
  depth,
}: {
  item: NavItem;
  pathname: string;
  depth: number;
}) {
  const href = `/docs/${item.slug}`;
  const isActive = pathname === href;
  const hasChildren = item.children && item.children.length > 0;
  const [expanded, setExpanded] = useState(
    isActive || pathname.startsWith(href + "/")
  );

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md group",
          depth > 0 && "ml-3 border-l border-border pl-3"
        )}
      >
        {hasChildren && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5"
          >
            <ChevronRight
              size={13}
              className={cn("transition-transform", expanded && "rotate-90")}
            />
          </button>
        )}

        <Link
          href={href}
          className={cn(
            "flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors truncate",
            !hasChildren && "ml-4",
            isActive
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <FileText size={13} className="shrink-0 opacity-60" />
          <span className="truncate">{item.title}</span>
        </Link>
      </div>

      {hasChildren && expanded && (
        <NavTree items={item.children!} pathname={pathname} depth={depth + 1} />
      )}
    </li>
  );
}
