'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-base font-bold text-[var(--text-primary)] first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-3 text-sm font-semibold text-[var(--text-secondary)]">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-2 text-sm leading-relaxed text-[var(--text-secondary)] last:mb-0">{children}</p>
  ),
  ul: ({ children }) => <ul className="mb-3 ml-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => (
    <li className="flex gap-2 text-sm leading-relaxed text-[var(--text-secondary)]">
      <span className="mt-0.5 shrink-0 text-[var(--accent)]">·</span>
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--accent)] underline underline-offset-2 transition hover:text-[var(--accent-hover)]"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="my-2 block overflow-x-auto rounded-lg bg-[#1f2937] px-3 py-2 font-mono text-xs text-slate-100">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-[#eff3f7] px-1.5 py-0.5 font-mono text-xs text-[var(--accent-hover)]">
        {children}
      </code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-[var(--accent)] pl-4 text-sm italic text-[var(--text-muted)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-[var(--border)]" />,
};

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
