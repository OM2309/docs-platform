import Link from "next/link";
import { BookOpen, Shield, Search, GitBranch, Zap, Users } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="w-4.5 h-4.5 text-primary-foreground" size={18} />
            </div>
            <span className="text-lg font-semibold tracking-tight">DocFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Documentation
            </Link>
            <Link
              href="/admin"
              className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium"
            >
              Admin Panel
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="max-w-4xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 mb-8">
            <Zap size={12} />
            Production-grade Documentation Platform
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-foreground mb-6 leading-tight">
            Documentation your team
            <span className="text-primary"> actually loves</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            DocFlow combines a powerful admin interface with beautifully rendered public docs.
            Full-text search, hierarchical navigation, draft/publish workflow — all in one place.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/docs"
              className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
            >
              Browse Documentation
            </Link>
            <Link
              href="/admin"
              className="border border-border text-foreground px-6 py-3 rounded-lg hover:bg-muted transition-colors font-medium text-sm"
            >
              Admin Dashboard
            </Link>
          </div>
        </section>

        {/* Features Grid */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Search,
                title: "Full-Text Search",
                desc: "PostgreSQL FTS with ts_headline snippets. Weighted ranking across title, description, and content.",
              },
              {
                icon: GitBranch,
                title: "Hierarchical Structure",
                desc: "Nest documents infinitely. Auto-generated sidebar navigation reflects your content tree.",
              },
              {
                icon: Shield,
                title: "Secure by Default",
                desc: "JWT access tokens + refresh token rotation. Draft content never leaks to public routes.",
              },
              {
                icon: Zap,
                title: "Draft / Publish",
                desc: "Work on docs privately. Publish when ready. Unpublish instantly without data loss.",
              },
              {
                icon: BookOpen,
                title: "Markdown Rendering",
                desc: "Rich markdown with GFM support — tables, code blocks, task lists, and more.",
              },
              {
                icon: Users,
                title: "Version History",
                desc: "Every save creates a version snapshot. Restore previous content at any time.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="border border-border rounded-xl p-6 bg-card hover:border-primary/40 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon size={20} className="text-primary" />
                </div>
                <h3 className="font-semibold mb-2 text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>DocFlow — Built with Next.js + Go + PostgreSQL</span>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/admin" className="hover:text-foreground transition-colors">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
