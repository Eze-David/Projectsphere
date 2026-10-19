import { useEffect, useState } from 'react';

// useState that persists to localStorage under `key`. `initial` may be a value or a function (like useState).
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch {
      // fall through to initial
    }
    return typeof initial === 'function' ? initial() : initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or unavailable — keep in-memory state only
    }
  }, [key, value]);

  return [value, setValue];
}

// Calls onOutside when a mousedown lands outside `ref` or Escape is pressed, while `active`.
export function useClickOutside(ref, onOutside, active = true) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    const onKey = (e) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onOutside, active]);
}

export function matchesQuery(query, ...fields) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
}

export function formatDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', opts);
}

export const shortDate = (iso) => formatDate(iso, { month: 'short', day: 'numeric' });
