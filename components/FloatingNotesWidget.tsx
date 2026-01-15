import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StickyNote, Plus, Minus, Maximize2, Trash2, Check, GripVertical, X, Edit3 } from 'lucide-react';

interface Note {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

interface WidgetState {
  notes: Note[];
  position: { x: number; y: number };
  isMinimized: boolean;
}

const STORAGE_KEY = 'floating-notes-widget';

const getInitialState = (): WidgetState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load notes:', e);
  }
  return {
    notes: [],
    position: { x: window.innerWidth - 340, y: window.innerHeight - 450 },
    isMinimized: false,
  };
};

const FloatingNotesWidget: React.FC = () => {
  const [state, setState] = useState<WidgetState>(getInitialState);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [newNoteText, setNewNoteText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const widgetRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const saveState = useCallback((newState: WidgetState) => {
    setState(newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (e) {
      console.error('Failed to save notes:', e);
    }
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Failed to sync notes:', err);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setState(prev => {
        const maxX = window.innerWidth - 320;
        const maxY = window.innerHeight - (prev.isMinimized ? 50 : 400);
        return {
          ...prev,
          position: {
            x: Math.min(Math.max(0, prev.position.x), maxX),
            y: Math.min(Math.max(0, prev.position.y), maxY),
          },
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setIsDragging(true);
    const rect = widgetRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 320));
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - (state.isMinimized ? 50 : 400)));
      saveState({ ...state, position: { x: newX, y: newY } });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, state, saveState]);

  const addNote = () => {
    if (!newNoteText.trim()) return;
    const newNote: Note = {
      id: `note-${Date.now()}`,
      text: newNoteText.trim(),
      completed: false,
      createdAt: Date.now(),
    };
    saveState({ ...state, notes: [...state.notes, newNote] });
    setNewNoteText('');
    inputRef.current?.focus();
  };

  const toggleComplete = (id: string) => {
    saveState({
      ...state,
      notes: state.notes.map(n => n.id === id ? { ...n, completed: !n.completed } : n),
    });
  };

  const deleteNote = (id: string) => {
    saveState({ ...state, notes: state.notes.filter(n => n.id !== id) });
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    saveState({
      ...state,
      notes: state.notes.map(n => n.id === editingId ? { ...n, text: editText.trim() || n.text } : n),
    });
    setEditingId(null);
    setEditText('');
  };

  const toggleMinimize = () => {
    saveState({ ...state, isMinimized: !state.isMinimized });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addNote();
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditText('');
    }
  };

  if (state.isMinimized) {
    return (
      <div
        ref={widgetRef}
        style={{
          position: 'fixed',
          left: state.position.x,
          top: state.position.y,
          zIndex: 9999,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        className="bg-amber-400 rounded-full p-3 shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2"
      >
        <StickyNote className="w-5 h-5 text-amber-900" />
        {state.notes.length > 0 && (
          <span className="bg-amber-900 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {state.notes.length}
          </span>
        )}
        <button
          onClick={toggleMinimize}
          className="no-drag p-1 hover:bg-amber-500 rounded-full transition-colors"
        >
          <Maximize2 className="w-4 h-4 text-amber-900" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={widgetRef}
      style={{
        position: 'fixed',
        left: state.position.x,
        top: state.position.y,
        zIndex: 9999,
        width: 320,
      }}
      className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
    >
      <div
        className="bg-gradient-to-r from-amber-400 to-amber-500 p-3 flex items-center justify-between cursor-grab"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex items-center gap-2 text-amber-900">
          <GripVertical className="w-4 h-4 opacity-60" />
          <StickyNote className="w-5 h-5" />
          <span className="font-bold text-sm">Notes</span>
          {state.notes.length > 0 && (
            <span className="bg-amber-900/20 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full">
              {state.notes.length}
            </span>
          )}
        </div>
        <button
          onClick={toggleMinimize}
          className="no-drag p-1.5 hover:bg-amber-600/20 rounded-lg transition-colors"
        >
          <Minus className="w-4 h-4 text-amber-900" />
        </button>
      </div>

      <div className="p-3 border-b border-slate-100">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newNoteText}
            onChange={e => setNewNoteText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a new note..."
            className="no-drag flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          />
          <button
            onClick={addNote}
            disabled={!newNoteText.trim()}
            className="no-drag px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto">
        {state.notes.length === 0 ? (
          <div className="p-6 text-center text-slate-400">
            <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notes yet</p>
            <p className="text-xs mt-1">Add your first note above</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {state.notes.map(note => (
              <div
                key={note.id}
                className={`p-3 flex items-start gap-3 hover:bg-slate-50 transition-colors ${note.completed ? 'bg-slate-50' : ''}`}
              >
                <button
                  onClick={() => toggleComplete(note.id)}
                  className={`no-drag mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    note.completed
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-slate-300 hover:border-amber-400'
                  }`}
                >
                  {note.completed && <Check className="w-3 h-3" />}
                </button>

                {editingId === note.id ? (
                  <input
                    type="text"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={saveEdit}
                    autoFocus
                    className="no-drag flex-1 px-2 py-1 text-sm border border-amber-400 rounded focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                ) : (
                  <span
                    className={`flex-1 text-sm ${
                      note.completed ? 'line-through text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    {note.text}
                  </span>
                )}

                <div className="flex items-center gap-1 flex-shrink-0">
                  {editingId !== note.id && (
                    <button
                      onClick={() => startEdit(note)}
                      className="no-drag p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="no-drag p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FloatingNotesWidget;
