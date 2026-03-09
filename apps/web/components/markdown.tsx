'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h3: ({ children }) => (
    <h3 className="font-bold text-white text-base mt-5 mb-2 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-semibold text-gray-200 text-sm mt-3 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-gray-200 text-sm leading-relaxed mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="space-y-1 mb-3 ml-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="space-y-1 mb-3 ml-4 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-gray-200 leading-relaxed flex gap-2">
      <span className="text-blue-400 shrink-0 mt-0.5">·</span>
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block bg-zinc-800 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono overflow-x-auto my-2">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-zinc-800 rounded px-1.5 py-0.5 text-xs text-blue-300 font-mono">
        {children}
      </code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-blue-500/40 pl-4 my-3 text-gray-400 text-sm italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-white/10 my-4" />,
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
