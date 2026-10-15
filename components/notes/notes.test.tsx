import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NotesMarkdown from './NotesMarkdown';
import { buildReferenceHref, normalizeNote } from './types';
import { parseHashState } from '../../routingUtils';

test('legacy plain notes retain content, completion and creation date', () => {
  assert.deepEqual(normalizeNote({ id: 'legacy', text: 'Follow up', completed: true, createdAt: 123 }), {
    id: 'legacy', text: 'Follow up', completed: true, createdAt: 123,
  });
  assert.equal(normalizeNote(null), null);
  assert.equal(normalizeNote({ text: 'Missing id' }), null);
});

test('record links encode identifiers and route to their correct sections', () => {
  for (const [type, parameter, view] of [
    ['product', 'noteProduct', 'inventory'],
    ['supplier', 'noteSupplier', 'suppliers'],
    ['customer', 'noteCustomer', 'proforma'],
    ['invoice', 'noteInvoice', 'proforma'],
  ] as const) {
    const id = 'ID & / special';
    const href = buildReferenceHref(type, id);
    assert.equal(parseHashState(href).view, view);
    assert.equal(new URLSearchParams(href.split('?')[1]).get(parameter), id);
  }
});

test('stored references never trust supplied URLs or unknown record types', () => {
  const note = normalizeNote({
    id: 'safe', text: 'Linked note',
    references: [
      { type: 'product', id: 'P1', label: 'Product', href: 'javascript:alert(1)' },
      { type: 'unknown', id: 'x', label: 'Bad', href: 'https://example.com' },
      null,
    ],
  });
  assert.equal(note?.references?.length, 1);
  assert.equal(note?.references?.[0].href, '#inventory?noteProduct=P1');
});

test('rich notes render emphasis, multiline paragraphs and both list styles', () => {
  const html = renderToStaticMarkup(<NotesMarkdown text={'**Bold** and *italic*\nsecond line\n\n- Item\n- Other\n\n1. First'} />);
  assert.match(html, /<strong[^>]*>Bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<br\/>/);
  assert.match(html, /<ul/);
  assert.match(html, /<ol/);
});

test('external hyperlinks allow HTTP(S), block script/data protocols and escape HTML', () => {
  const html = renderToStaticMarkup(<NotesMarkdown text={'[Good](https://example.com/path) [Bad](javascript:evil) [Data](data:text/html,bad) <img src=x onerror=evil>'} />);
  assert.match(html, /href="https:\/\/example.com\/path"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /href="javascript:|href="data:|<img/);
  assert.match(html, /&lt;img/);
});
