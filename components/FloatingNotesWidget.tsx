import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, Check, ChevronDown, ExternalLink, Italic, Link2, List, ListOrdered,
  Minus, Plus, Search, StickyNote, Trash2, X, GripVertical, RotateCw,
} from 'lucide-react';
import { api } from '../client/api';
import { CustomerData, Product, ProformaData, Supplier } from '../types';
import NotesMarkdown from './notes/NotesMarkdown';
import {
  buildReferenceHref, normalizeNote, NOTES_STORAGE_KEY, NoteReference,
  NoteReferenceType, NotesWidgetState, StoredNote,
} from './notes/types';

interface FloatingNotesWidgetProps {
  products?: Product[];
  suppliers?: Supplier[];
}

type DirectoryRecord = NoteReference & { searchable: string };

const initialState = (): NotesWidgetState => {
  const fallback: NotesWidgetState = {
    notes: [],
    position: { x: Math.max(12, window.innerWidth - 480), y: 84 },
    isMinimized: false,
  };
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<NotesWidgetState>;
    return {
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(normalizeNote).filter((note): note is StoredNote => !!note) : [],
      position: parsed.position && Number.isFinite(parsed.position.x) && Number.isFinite(parsed.position.y)
        ? parsed.position : fallback.position,
      isMinimized: Boolean(parsed.isMinimized),
    };
  } catch {
    return fallback;
  }
};

const FloatingNotesWidget: React.FC<FloatingNotesWidgetProps> = ({ products = [], suppliers = [] }) => {
  const [state, setState] = useState<NotesWidgetState>(initialState);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftRefs, setDraftRefs] = useState<NoteReference[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editRefs, setEditRefs] = useState<NoteReference[]>([]);
  const [recordQuery, setRecordQuery] = useState('');
  const [showReferenceSearch, setShowReferenceSearch] = useState(false);
  const [noteQuery, setNoteQuery] = useState('');
  const [customerRecords, setCustomerRecords] = useState<CustomerData[]>([]);
  const [invoiceRecords, setInvoiceRecords] = useState<ProformaData[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const persist = useCallback((next: NotesWidgetState) => {
    setState(next);
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('Your browser could not save this change. Free up storage space and try again.');
    }
  }, []);

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    setDirectoryError('');
    const [customersResult, invoicesResult] = await Promise.allSettled([api.getCustomers(), api.getProformas()]);
    const failures: string[] = [];
    if (customersResult.status === 'fulfilled') setCustomerRecords(customersResult.value as CustomerData[]);
    else failures.push('customers');
    if (invoicesResult.status === 'fulfilled') setInvoiceRecords(invoicesResult.value as ProformaData[]);
    else failures.push('proforma invoices');
    if (failures.length) setDirectoryError(`Could not load ${failures.join(' and ')}. Retry to search those records.`);
    setDirectoryLoading(false);
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    const open = () => {
      setIsOpen(true);
      setState(current => current.isMinimized ? { ...current, isMinimized: false } : current);
    };
    window.addEventListener('open-notes', open);
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== NOTES_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as Partial<NotesWidgetState>;
        setState(current => ({
          ...current,
          ...parsed,
          notes: Array.isArray(parsed.notes) ? parsed.notes.map(normalizeNote).filter((note): note is StoredNote => !!note) : current.notes,
        }));
      } catch {
        setStorageError('Notes from another tab could not be synchronized.');
      }
    };
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener('open-notes', open);
      window.removeEventListener('storage', syncStorage);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !editingId && !showReferenceSearch) setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, editingId, showReferenceSearch]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => {
      const width = Math.min(456, window.innerWidth - 24);
      const height = panelRef.current?.offsetHeight ?? 520;
      const x = Math.max(12, Math.min(event.clientX - dragOffset.current.x, window.innerWidth - width - 12));
      const y = Math.max(12, Math.min(event.clientY - dragOffset.current.y, window.innerHeight - Math.min(height, window.innerHeight - 24) - 12));
      persist({ ...state, position: { x, y } });
    };
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging, persist, state]);

  const directory = useMemo<DirectoryRecord[]>(() => {
    const productItems = products.map(product => ({
      type: 'product' as const,
      id: product.id,
      label: product.name,
      detail: product.stockCode ? `Stock ${product.stockCode}` : 'Product',
      href: buildReferenceHref('product', product.id),
      searchable: `${product.name} ${product.stockCode || ''} ${product.supplier || ''}`.toLocaleLowerCase(),
    }));
    const supplierItems = suppliers.map(supplier => ({
      type: 'supplier' as const,
      id: supplier.id,
      label: supplier.name,
      detail: supplier.supplierCode || supplier.country || 'Supplier',
      href: buildReferenceHref('supplier', supplier.id),
      searchable: `${supplier.name} ${supplier.supplierCode || ''} ${supplier.country || ''}`.toLocaleLowerCase(),
    }));
    const customerItems = customerRecords.map(customer => ({
      type: 'customer' as const,
      id: String(customer.id),
      label: customer.name,
      detail: 'Customer',
      href: buildReferenceHref('customer', String(customer.id)),
      searchable: `${customer.name} ${customer.id}`.toLocaleLowerCase(),
    }));
    const invoiceItems = invoiceRecords.map(invoice => ({
      type: 'invoice' as const,
      id: invoice.proformaId,
      label: invoice.proformaId,
      detail: invoice.customerName || 'Proforma invoice',
      href: buildReferenceHref('invoice', invoice.proformaId),
      searchable: `${invoice.proformaId} ${invoice.customerName || ''} ${invoice.status || ''}`.toLocaleLowerCase(),
    }));
    return [...productItems, ...supplierItems, ...customerItems, ...invoiceItems];
  }, [products, suppliers, customerRecords, invoiceRecords]);

  const filteredDirectory = useMemo(() => {
    const query = recordQuery.trim().toLocaleLowerCase();
    return directory.filter(item => !query || item.searchable.includes(query)).slice(0, 8);
  }, [directory, recordQuery]);
  const filteredNotes = useMemo(() => {
    const query = noteQuery.trim().toLocaleLowerCase();
    return state.notes.filter(note => !query || `${note.text} ${(note.references || []).map(ref => `${ref.label} ${ref.detail || ''}`).join(' ')}`.toLocaleLowerCase().includes(query));
  }, [noteQuery, state.notes]);

  const addNote = () => {
    if (!draft.trim()) return;
    const note: StoredNote = { id: `note-${Date.now()}`, text: draft.trim(), completed: false, createdAt: Date.now(), references: draftRefs };
    persist({ ...state, notes: [note, ...state.notes] });
    setDraft('');
    setDraftRefs([]);
  };
  const saveEdit = (id: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    persist({ ...state, notes: state.notes.map(note => note.id === id ? { ...note, text: trimmed, references: editRefs } : note) });
    setEditingId(null);
  };
  const toggleComplete = (id: string) => persist({
    ...state, notes: state.notes.map(note => note.id === id ? { ...note, completed: !note.completed } : note),
  });
  const deleteNote = (id: string) => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    persist({ ...state, notes: state.notes.filter(note => note.id !== id) });
    if (editingId === id) setEditingId(null);
  };
  const addReference = (reference: NoteReference) => {
    const target = editingId ? editRefs : draftRefs;
    if (target.some(item => item.type === reference.type && item.id === reference.id)) return;
    if (editingId) setEditRefs([...editRefs, reference]);
    else setDraftRefs([...draftRefs, reference]);
    setRecordQuery('');
    setShowReferenceSearch(false);
  };
  const removeReference = (reference: NoteReference, editing: boolean) => {
    const setter = editing ? setEditRefs : setDraftRefs;
    const source = editing ? editRefs : draftRefs;
    setter(source.filter(item => !(item.type === reference.type && item.id === reference.id)));
  };
  const insertFormat = (prefix: string, suffix = prefix) => {
    const input = editorRef.current;
    const value = editingId ? editText : draft;
    const setValue = editingId ? setEditText : setDraft;
    if (!input) {
      setValue(`${value}${value ? '\n' : ''}${prefix}text${suffix}`);
      return;
    }
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end) || 'text';
    const isLink = prefix === '[';
    const listPrefix = (prefix === '- ' || prefix === '1. ') && start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const next = `${value.slice(0, start)}${listPrefix}${prefix}${selected}${suffix}${value.slice(end)}`;
    setValue(next);
    requestAnimationFrame(() => {
      input.focus();
      const selectionStart = isLink ? start + prefix.length + selected.length + 2 : start + listPrefix.length + prefix.length;
      input.setSelectionRange(selectionStart, isLink ? selectionStart + 'https://example.com'.length : selectionStart + selected.length);
    });
  };
  const startDrag = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDragging(true);
  };
  const activeReferences = editingId ? editRefs : draftRefs;
  const referenceTypeLabel: Record<NoteReferenceType, string> = {
    product: 'Product', supplier: 'Supplier', customer: 'Customer', invoice: 'Invoice',
  };

  if (!isOpen) return null;

  return (
    <section
      ref={panelRef}
      aria-label="Notes window"
      className={`fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-amber-200 bg-[#fffdf8] shadow-[0_24px_80px_rgba(30,41,59,.24)] transition-[box-shadow] ${dragging ? 'shadow-[0_30px_90px_rgba(30,41,59,.32)]' : ''}`}
      style={{
        left: window.innerWidth < 560 ? 12 : Math.max(12, Math.min(state.position.x, window.innerWidth - 468)),
        top: window.innerWidth < 560 ? 12 : Math.max(12, Math.min(state.position.y, window.innerHeight - 120)),
        width: 'min(456px, calc(100vw - 24px))',
        maxHeight: 'calc(100dvh - 24px)',
      }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="notes-title"
    >
      <header onMouseDown={startDrag} className="flex shrink-0 items-center justify-between border-b border-amber-200/80 bg-[#f6e8c5] px-4 py-3 cursor-grab active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-2.5 text-slate-800">
          <GripVertical aria-hidden="true" className="h-4 w-4 text-amber-800/50" />
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500 text-white shadow-sm"><StickyNote className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="notes-title" className="text-sm font-bold tracking-tight">Notes</h2>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-900">{state.notes.length}</span>
            </div>
            <p className="text-[10px] text-slate-600">Private to this browser</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => persist({ ...state, isMinimized: true })} className="rounded-lg p-2 text-slate-600 hover:bg-white/70 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700" aria-label="Minimize notes"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-slate-600 hover:bg-white/70 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700" aria-label="Close notes"><X className="h-4 w-4" /></button>
        </div>
      </header>
      {state.isMinimized ? (
        <button type="button" onClick={() => persist({ ...state, isMinimized: false })} className="flex items-center justify-between px-4 py-3 text-left text-sm text-slate-700 hover:bg-amber-50">
          <span>Notes minimized</span><span className="flex items-center gap-1 text-xs font-semibold text-amber-800">Restore <ChevronDown className="h-3.5 w-3.5 rotate-180" /></span>
        </button>
      ) : (
        <>
          {storageError && <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{storageError}</div>}
          <div className="shrink-0 border-b border-slate-200/80 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">{editingId ? 'Edit note' : 'New note'}</p>
              <span className="text-[10px] text-slate-400">Markdown supported</span>
            </div>
            <div className="mb-2 flex items-center gap-1">
              {[
                { label: 'Bold', icon: <Bold className="h-3.5 w-3.5" />, prefix: '**' },
                { label: 'Italic', icon: <Italic className="h-3.5 w-3.5" />, prefix: '*' },
                { label: 'Bullet list', icon: <List className="h-3.5 w-3.5" />, prefix: '- ', suffix: '' },
                { label: 'Numbered list', icon: <ListOrdered className="h-3.5 w-3.5" />, prefix: '1. ', suffix: '' },
                { label: 'Link', icon: <Link2 className="h-3.5 w-3.5" />, prefix: '[', suffix: '](https://example.com)' },
              ].map(tool => <button key={tool.label} type="button" onClick={() => insertFormat(tool.prefix, tool.suffix ?? tool.prefix)} aria-label={tool.label} title={tool.label} className="rounded-md p-1.5 text-slate-500 hover:bg-amber-100 hover:text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700">{tool.icon}</button>)}
            </div>
            <textarea
              ref={editorRef}
              value={editingId ? editText : draft}
              onChange={event => editingId ? setEditText(event.target.value) : setDraft(event.target.value)}
              onKeyDown={event => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  if (editingId) saveEdit(editingId);
                  else addNote();
                }
                if (event.key === 'Escape' && editingId) setEditingId(null);
              }}
              rows={3}
              placeholder="Write a note… Use **bold**, *italic*, - lists, and [safe links](https://…)."
              aria-label={editingId ? 'Edit note text' : 'New note text'}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            {activeReferences.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
              {activeReferences.map(reference => <span key={`${reference.type}:${reference.id}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-950">
                <a href={reference.href} className="max-w-[220px] truncate hover:underline" title={`${referenceTypeLabel[reference.type]} · ${reference.label}`}>{referenceTypeLabel[reference.type]} · {reference.label}{reference.detail ? ` · ${reference.detail}` : ''}</a>
                <button type="button" onClick={() => removeReference(reference, Boolean(editingId))} aria-label={`Remove ${reference.label} link`} className="rounded-full p-0.5 hover:bg-amber-200"><X className="h-3 w-3" /></button>
              </span>)}
            </div>}
            {showReferenceSearch ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <input autoFocus value={recordQuery} onChange={event => setRecordQuery(event.target.value)} placeholder="Search products, stock codes, suppliers…" className="h-10 min-w-0 flex-1 text-xs outline-none" aria-label="Search records to link" />
                  <button type="button" onClick={() => setShowReferenceSearch(false)} aria-label="Close record search" className="p-1 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
                </div>
                {directoryLoading ? <div className="space-y-2 p-3" aria-label="Loading records"><div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" /><div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" /></div>
                  : directoryError && directory.length === 0 ? <div role="alert" className="flex items-center justify-between gap-2 p-3 text-xs text-red-700">{directoryError}<button type="button" onClick={loadDirectory} className="inline-flex items-center gap-1 font-semibold"><RotateCw className="h-3 w-3" /> Retry</button></div>
                    : filteredDirectory.length ? <div className="max-h-48 overflow-y-auto p-1">{filteredDirectory.map(item => (
                      <button key={`${item.type}:${item.id}`} type="button" onClick={() => addReference(item)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
                        <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{item.label}</span><span className="block truncate text-[10px] text-slate-500">{item.detail}</span></span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{referenceTypeLabel[item.type]}</span>
                      </button>
                    ))}</div> : <p className="px-3 py-4 text-center text-xs text-slate-500">{directoryError || 'No matching records in the loaded directory.'}</p>}
                {directoryError && directory.length > 0 && <div role="alert" className="flex items-center justify-between border-t border-amber-100 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">{directoryError}<button type="button" onClick={loadDirectory} className="font-bold">Retry</button></div>}
              </div>
            ) : <button type="button" onClick={() => setShowReferenceSearch(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700"><Link2 className="h-3.5 w-3.5" /> Link a record</button>}
            <div className="mt-2 flex justify-end gap-2">
              {editingId && <button type="button" onClick={() => { setEditingId(null); setEditRefs([]); }} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>}
              <button type="button" disabled={!(editingId ? editText : draft).trim()} onClick={() => editingId ? saveEdit(editingId) : addNote()} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                {editingId ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{editingId ? 'Save note' : 'Add note'}
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input value={noteQuery} onChange={event => setNoteQuery(event.target.value)} placeholder="Filter notes and linked records" aria-label="Filter notes" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400" />
              <span className="text-[10px] tabular-nums text-slate-400">{filteredNotes.length} / {state.notes.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {state.notes.length === 0 ? <div className="grid min-h-36 place-items-center px-6 py-7 text-center">
                <div><span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-800"><StickyNote className="h-5 w-5" /></span><p className="text-sm font-semibold text-slate-700">A clear page</p><p className="mt-1 text-xs text-slate-500">Notes stay in this browser. Link records to keep context close.</p></div>
              </div> : filteredNotes.length === 0 ? <p className="px-5 py-7 text-center text-xs text-slate-500">No notes match that search.</p> : (
                <ul className="divide-y divide-slate-100">
                  {filteredNotes.map(note => <li key={note.id} className={`group px-4 py-3 transition-colors hover:bg-amber-50/40 ${note.completed ? 'bg-slate-50/70' : ''}`}>
                    <div className="flex items-start gap-2.5">
                      <button type="button" onClick={() => toggleComplete(note.id)} aria-label={note.completed ? 'Mark note incomplete' : 'Mark note complete'} aria-pressed={note.completed} className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700 ${note.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-amber-500'}`}><Check className="h-3.5 w-3.5" /></button>
                      <div className={`min-w-0 flex-1 text-xs text-slate-700 ${note.completed ? 'text-slate-400 line-through' : ''}`}>
                        {editingId === note.id ? <p className="text-slate-400">Editing above</p> : <NotesMarkdown text={note.text} />}
                        {note.references?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{note.references.map(ref => <a key={`${ref.type}:${ref.id}`} href={ref.href} className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium no-underline transition hover:border-amber-300 hover:bg-amber-50 ${note.completed ? 'border-slate-200 text-slate-400' : 'border-slate-200 bg-white text-slate-600'}`} title={`${referenceTypeLabel[ref.type]} · ${ref.label}`}><ExternalLink className="h-3 w-3 shrink-0 text-amber-700" /><span className="truncate">{referenceTypeLabel[ref.type]}: {ref.label}</span>{ref.detail && <span className="hidden truncate text-slate-400 sm:inline">· {ref.detail}</span>}</a>)}</div> : null}
                        <p className="mt-2 text-[10px] text-slate-400">{new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                      </div>
                      <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        <button type="button" onClick={() => { setEditingId(note.id); setEditText(note.text); setEditRefs(note.references || []); setShowReferenceSearch(false); }} aria-label="Edit note" className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700"><span className="text-[10px] font-semibold">Edit</span></button>
                        <button type="button" onClick={() => deleteNote(note.id)} aria-label="Delete note" className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </li>)}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default FloatingNotesWidget;
