export type NoteReferenceType = 'product' | 'supplier' | 'customer' | 'invoice';

export interface NoteReference {
  type: NoteReferenceType;
  id: string;
  label: string;
  detail?: string;
  href: string;
}

export interface StoredNote {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  references?: NoteReference[];
}

export interface NotesWidgetState {
  notes: StoredNote[];
  position: { x: number; y: number };
  isMinimized: boolean;
}

export const NOTES_STORAGE_KEY = 'floating-notes-widget';

export function buildReferenceHref(type: NoteReferenceType, id: string): string {
  const encoded = encodeURIComponent(id);
  if (type === 'product') return `#inventory?noteProduct=${encoded}`;
  if (type === 'supplier') return `#suppliers?noteSupplier=${encoded}`;
  if (type === 'customer') return `#proforma?noteCustomer=${encoded}`;
  return `#proforma?noteInvoice=${encoded}`;
}

export function normalizeNote(value: unknown): StoredNote | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StoredNote>;
  if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string') return null;
  const references = Array.isArray(candidate.references)
    ? candidate.references.flatMap((reference): NoteReference[] => {
      if (!reference || typeof reference !== 'object') return [];
      const item = reference as Partial<NoteReference>;
      if (!item.id || typeof item.id !== 'string' || typeof item.label !== 'string'
        || !['product', 'supplier', 'customer', 'invoice'].includes(item.type || '')) return [];
      const type = item.type as NoteReferenceType;
      return [{
        type,
        id: item.id,
        label: item.label,
        ...(typeof item.detail === 'string' ? { detail: item.detail } : {}),
        // Never trust a persisted URL: only the app's fixed hash contract is allowed.
        href: buildReferenceHref(type, item.id),
      }];
    })
    : [];
  return {
    id: candidate.id,
    text: candidate.text,
    completed: Boolean(candidate.completed),
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    ...(references.length ? { references } : {}),
  };
}
