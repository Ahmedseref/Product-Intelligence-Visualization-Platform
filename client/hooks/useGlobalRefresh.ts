import { useCallback, useEffect, useRef, useState } from 'react';

interface UseGlobalRefreshOptions {
  intervalMs?: number;
  debounceMs?: number;
}

export function useGlobalRefresh(
  onRefresh: () => void,
  options: UseGlobalRefreshOptions = {}
) {
  const { intervalMs = 30000, debounceMs = 500 } = options;

  const [isEditing, setIsEditing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const triggerIdRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

  const debouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onRefreshRef.current();
      setLastSynced(new Date());
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    const poll = async () => {
      if (isEditingRef.current || isFetchingRef.current) return;

      isFetchingRef.current = true;
      try {
        const res = await fetch('/api/refresh-state', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}` },
        });
        if (!res.ok) return;
        const data: { triggerId: number; lastUpdated: string | null } = await res.json();

        if (triggerIdRef.current !== null && data.triggerId !== triggerIdRef.current) {
          debouncedRefresh();
        } else if (triggerIdRef.current === null) {
          setLastSynced(new Date());
        }
        triggerIdRef.current = data.triggerId;
      } catch {
      } finally {
        isFetchingRef.current = false;
      }
    };

    poll();
    const interval = setInterval(poll, intervalMs);
    return () => {
      clearInterval(interval);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [intervalMs, debouncedRefresh]);

  return { setIsEditing, lastSynced };
}
