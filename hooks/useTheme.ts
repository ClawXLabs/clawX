import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let stored: Theme | null = null;
    try { stored = localStorage.getItem('cp-theme') as Theme | null; } catch { /* restricted storage */ }
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const initial = stored ?? preferred;
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try { localStorage.setItem('cp-theme', next); } catch { /* restricted storage */ }
      return next;
    });
  };

  return { theme, toggle };
}
