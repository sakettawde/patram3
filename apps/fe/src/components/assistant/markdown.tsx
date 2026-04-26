// v10 API: no `inline` prop on code — discriminate inline vs block by presence of `language-*` className
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "#/lib/utils";

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const text = typeof children === "string" ? children : String(children ?? "");
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="relative my-2 overflow-hidden rounded border border-(--rule) bg-(--paper-soft)">
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded text-(--ink-faint) hover:bg-(--paper) hover:text-(--ink)"
        onClick={onCopy}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre className={cn("overflow-x-auto p-3 text-[12.5px] leading-relaxed", className)}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-assistant text-[13px] leading-relaxed text-(--ink)">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--ink) underline underline-offset-2"
            >
              {children}
            </a>
          ),
          // v10: code receives standard HTML props; className starting with "language-" indicates a fenced block
          code({ className, children }) {
            const isBlock = /^language-/.test(className ?? "");
            if (isBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return (
              <code className="rounded bg-(--paper-soft) px-1 py-0.5 font-mono text-[12px]">
                {children}
              </code>
            );
          },
          // Unwrap the default <pre> wrapper since CodeBlock renders its own
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
