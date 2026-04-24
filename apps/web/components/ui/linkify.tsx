import type { ReactNode } from 'react';

const URL_REGEX = /(https?:\/\/[^\s<>()[\]{}"']+[^\s<>()[\]{}"'.,;:!?])/g;
const PHONE_REGEX = /(\d{2,4}-\d{3,4}-\d{4}|\b15\d{2}-\d{4}\b|\b16\d{2}-\d{4}\b|\b18\d{2}-\d{4}\b|\b\d{3,4}-\d{4}\b)/g;
const EMAIL_REGEX = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

type Token = { kind: 'text'; value: string } | { kind: 'url' | 'tel' | 'mail'; value: string };

function tokenize(text: string): Token[] {
  const combined = new RegExp(
    `${URL_REGEX.source}|${EMAIL_REGEX.source}|${PHONE_REGEX.source}`,
    'g',
  );
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of text.matchAll(combined)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: 'text', value: text.slice(cursor, start) });
    }
    const value = match[0];
    if (/^https?:\/\//i.test(value)) {
      tokens.push({ kind: 'url', value });
    } else if (value.includes('@')) {
      tokens.push({ kind: 'mail', value });
    } else {
      tokens.push({ kind: 'tel', value });
    }
    cursor = start + value.length;
  }
  if (cursor < text.length) {
    tokens.push({ kind: 'text', value: text.slice(cursor) });
  }
  return tokens;
}

export function Linkify({ text }: { text: string }): ReactNode {
  if (!text) return null;
  const tokens = tokenize(text);
  return tokens.map((token, index) => {
    if (token.kind === 'text') {
      return <span key={index}>{token.value}</span>;
    }
    const href =
      token.kind === 'url'
        ? token.value
        : token.kind === 'mail'
          ? `mailto:${token.value}`
          : `tel:${token.value.replace(/-/g, '')}`;
    const external = token.kind === 'url';
    return (
      <a
        key={index}
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        style={{
          color: 'var(--accent-text)',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
          wordBreak: 'break-all',
        }}
      >
        {token.value}
      </a>
    );
  });
}
