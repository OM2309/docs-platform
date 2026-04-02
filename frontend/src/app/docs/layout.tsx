import { Suspense } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import PublicSidebar from "@/src/components/public/PublicSidebar";
import PublicSearchBar from "@/src/components/public/PublicSearchBar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Nav */}
      <header className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-50 h-14">
        <div className="flex items-center h-full px-4 gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <BookOpen size={15} className="text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight">DocFlow</span>
          </Link>

          <div className="h-4 w-px bg-border mx-1" />

          <div className="flex-1 max-w-md">
            <Suspense>
              <PublicSearchBar />
            </Suspense>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/admin"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Admin →
            </Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[var(--sidebar-width)] border-r border-border bg-background shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <Suspense fallback={<SidebarSkeleton />}>
            <PublicSidebar />
          </Suspense>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="p-4 space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-8 rounded-md bg-muted animate-pulse" />
      ))}
    </div>
  );
}
