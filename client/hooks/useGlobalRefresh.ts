import { useCallback, useEffect, useRef, useState } from 'react';

interface UseGlobalRefreshOptions {
  intervalMs?: number;
  debounceMs?: number;
}

export function useGlobalRefresh(
  onRefresh: () => Promise<void>,
  options: UseGlobalRefreshOptions = {}
) {
  const { intervalMs = 30000, debounceMs = 500 } = options;

  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const manualLockCountRef = useRef(0);
  const isFocusEditingRef = useRef(false);
  const isEditingRef = useRef(false);

  const triggerIdRef = useRef<number | null>(null);
  const isPollFetchingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const recalcEditing = useCallback(() => {
    isEditingRef.current = manualLockCountRef.current > 0 || isFocusEditingRef.current;
  }, []);

  const lockEditing = useCallback(() => {
    manualLockCountRef.current += 1;
    recalcEditing();
  }, [recalcEditing]);

  const unlockEditing = useCallback(() => {
    manualLockCountRef.current = Math.max(0, manualLockCountRef.current - 1);
    recalcEditing();
  }, [recalcEditing]);

  const doRefresh = useCallback(async () => {
    isRefreshingRef.current = true;
    try {
      await onRefreshRef.current();
      setLastSynced(new Date());
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const debouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      doRefresh();
    }, debounceMs);
  }, [debounceMs, doRefresh]);

  useEffect(() => {
    const poll = async () => {
      if (isEditingRef.current || isPollFetchingRef.current || isRefreshingRef.current) return;

      isPollFetchingRef.current = true;
      try {
        const res = await fetch('/api/refresh-state', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}` },
        });
        if (!res.ok) return;
        const data: { triggerId: number; lastUpdated: string | null } = await res.json();

        if (triggerIdRef.current !== null && data.triggerId !== triggerIdRef.current) {
          triggerIdRef.current = data.triggerId;
          debouncedRefresh();
        } else if (triggerIdRef.current === null) {
          triggerIdRef.current = data.triggerId;
          setLastSynced(new Date());
        }
      } catch {
      } finally {
        isPollFetchingRef.current = false;
      }
    };

    poll();
    const interval = setInterval(poll, intervalMs);
    return () => {
      clearInterval(interval);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [intervalMs, debouncedRefresh]);

  useEffect(() => {
    const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (EDITABLE_TAGS.has(target.tagName) || target.isContentEditable) {
        isFocusEditingRef.current = true;
        recalcEditing();
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || (!EDITABLE_TAGS.has(active.tagName) && !active.isContentEditable)) {
          isFocusEditingRef.current = false;
          recalcEditing();
        }
      }, 200);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [recalcEditing]);

  return { lockEditing, unlockEditing, lastSynced };
}
