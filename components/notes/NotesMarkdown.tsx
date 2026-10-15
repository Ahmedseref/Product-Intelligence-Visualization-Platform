import React from 'react';

const safeExternalUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
};

function renderInline(source: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(source))) {
    if (match.index > lastIndex) nodes.push(source.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[2] && match[3]) {
      const href = safeExternalUrl(match[3]);
      nodes.push(href
        ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-amber-800 underline decoration-amber-400 underline-offset-2 hover:text-amber-950">{match[2]}</a>
        : <span key={key}>{match[2]}</span>);
    } else if (match[4] || match[5]) {
      nodes.push(<strong key={key} className="font-semibold text-slate-800">{match[4] || match[5]}</strong>);
    } else {
      nodes.push(<em key={key}>{match[6] || match[7]}</em>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

/** Safe markdown subset: emphasis, paragraphs, lists, and http(s) links only. */
export default function NotesMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={`p-${blocks.length}`} className="mb-2 last:mb-0">{paragraph.map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}{renderInline(line, `p-${blocks.length}-${i}`)}</React.Fragment>)}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(<Tag key={`list-${blocks.length}`} className={`mb-2 space-y-0.5 pl-5 last:mb-0 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
      {list.items.map((item, i) => <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>)}
    </Tag>);
    list = null;
  };

  lines.forEach((line) => {
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const match = unordered || ordered;
    if (match) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push(match[1]);
    } else {
      flushList();
      if (line.trim()) paragraph.push(line);
      else flushParagraph();
    }
  });
  flushParagraph();
  flushList();
  return <div className="whitespace-normal break-words leading-relaxed">{blocks}</div>;
}
