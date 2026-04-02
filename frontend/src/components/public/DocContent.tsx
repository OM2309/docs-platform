"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { cn } from "@/src/lib/utils";

export default function DocContent({ content }: { content: string }) {
  if (!content?.trim()) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm italic">
        This document has no content yet.
      </div>
    );
  }

  return (
    <div className={cn("prose")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          // Custom heading anchors
          h1: ({ children, id }) => (
            <h1 id={id} className="group">
              <a href={`#${id}`} className="no-underline">
                {children}
              </a>
            </h1>
          ),
          h2: ({ children, id }) => (
            <h2 id={id} className="group">
              <a href={`#${id}`} className="no-underline">
                {children}
              </a>
            </h2>
          ),
          h3: ({ children, id }) => (
            <h3 id={id}>
              <a href={`#${id}`} className="no-underline">
                {children}
              </a>
            </h3>
          ),
          // Code blocks
          code({ className, children }) {
            const isBlock = className?.startsWith("language-");
            if (isBlock) {
              return (
                <pre className="bg-muted rounded-lg p-4 overflow-x-auto my-6 relative">
                  {className && (
                    <div className="absolute top-2.5 right-3 text-xs text-muted-foreground font-mono opacity-60">
                      {className.replace("language-", "")}
                    </div>
                  )}
                  <code
                    className="text-sm font-mono"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code
                className="bg-muted text-foreground font-mono text-sm px-1.5 py-0.5 rounded"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {children}
              </code>
            );
          },
          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-6">
              <table className="w-full border-collapse">{children}</table>
            </div>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-6">
              {children}
            </blockquote>
          ),
          // Links - open external in new tab
          a: ({ href, children }) => {
            const isExternal = href?.startsWith("http");
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
