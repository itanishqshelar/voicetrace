'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import Link from 'next/link';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Home', subtitle: 'Record and analyze your sales' },
  '/dashboard': { title: 'Dashboard', subtitle: 'Your sales performance at a glance' },
  '/catalog': { title: 'Catalog', subtitle: 'Manage your items and products' },
  '/add': { title: 'Add Entry', subtitle: 'Manually record sales and expenses' },
};

export default function Navbar() {
  const pathname = usePathname();
  const page = PAGE_TITLES[pathname] || { title: 'VoiceTrace', subtitle: '' };

  const [isAddOpen, setIsAddOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setIsAddOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      id="navbar"
      className="sticky top-0 z-30 w-full h-16 bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 sm:px-8 shrink-0"
    >
      {/* Left — Page title (offset on mobile for hamburger) */}
      <div className="pl-12 md:pl-0">
        <h1 className="text-lg font-semibold text-text-primary leading-tight">
          {page.title}
        </h1>
        <p className="text-xs text-text-muted leading-tight hidden sm:block">
          {page.subtitle}
        </p>
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-2">
        {/* Add Entry Dropdown */}
        <div className="relative" ref={addMenuRef}>
          <button
            onClick={() => setIsAddOpen(!isAddOpen)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-primary hover:bg-primary-dark transition-colors shadow-sm"
            aria-label="Add Entry"
          >
            <Plus className="w-[18px] h-[18px]" />
          </button>
          
          {isAddOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-white border border-border rounded-xl shadow-lg overflow-hidden py-1 z-50 animate-fade-in-up">
              <Link
                href="/add?type=sale"
                onClick={() => setIsAddOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-light hover:text-emerald-600 transition-colors"
              >
                Add Sales
              </Link>
              <Link
                href="/add?type=expense"
                onClick={() => setIsAddOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-light hover:text-red-600 transition-colors"
              >
                Add Expenses
              </Link>
            </div>
          )}
        </div>

        {/* Avatar */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-sm font-bold ml-1 cursor-pointer hover:shadow-md transition-shadow">
          V
        </div>
      </div>
    </header>
  );
}
