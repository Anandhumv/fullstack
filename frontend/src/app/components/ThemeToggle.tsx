'use client';

import React, { useEffect, useState } from 'react';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadTheme() {
      await Promise.resolve();
      if (!active) return;

      const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('frontdesk-theme') : null;
      if (savedTheme === 'dark') {
        setTheme('dark');
        document.documentElement.classList.add('dark');
      } else {
        setTheme('light');
        document.documentElement.classList.remove('dark');
      }
      setMounted(true);
    }

    loadTheme();

    return () => {
      active = false;
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('frontdesk-theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  if (!mounted) {
    return (
      <button
        type="button"
        className={`w-8 h-8 rounded-md border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#111827] transition flex items-center justify-center cursor-pointer ${className}`}
        aria-label="Toggle theme"
      >
        <span className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`w-8 h-8 rounded-md border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-[#1E293B] text-slate-600 dark:text-[#F8FAFC] transition shadow-2xs flex items-center justify-center cursor-pointer ${className}`}
    >
      {theme === 'dark' ? (
        /* Sun Icon */
        <svg
          className="w-4 h-4 text-amber-300 transition-transform duration-200"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        /* Moon Icon */
        <svg
          className="w-4 h-4 text-slate-600 transition-transform duration-200"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
}
