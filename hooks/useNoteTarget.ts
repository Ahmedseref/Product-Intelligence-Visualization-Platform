import { useEffect, useState } from 'react';

/** Keeps record links working both on initial load and within an open view. */
export function useNoteTarget(parameter: string): string | null {
  const read = () => new URLSearchParams(window.location.hash.split('?')[1] || '').get(parameter);
  const [target, setTarget] = useState(read);
  useEffect(() => {
    const update = () => setTarget(read());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [parameter]);
  return target;
}
