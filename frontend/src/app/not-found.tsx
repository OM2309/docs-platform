import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6">
          <FileQuestion size={32} className="text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
          The page you are looking for does not exist or has been removed.
        </p>
        <Link
          href="/"
          className="bg-primary text-primary-foreground text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-primary/90 transition-colors inline-block"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
