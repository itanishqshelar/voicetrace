"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LayoutDashboard,
  PackageSearch,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Mic,
  Languages,
} from "lucide-react";

const navItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Catalog", href: "/catalog", icon: PackageSearch },
  { label: "Logs", href: "/logs", icon: ScrollText },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeLang, setActiveLang] = useState("en");

  const LANGS = [
    { code: "en", label: "EN" },
    { code: "hi", label: "हिं" },
    { code: "mr", label: "मरा" },
  ];

  // Read initial lang from cookie on mount
  useEffect(() => {
    const match = document.cookie.match(/googtrans=\/en\/([a-z]+)/);
    if (match) setActiveLang(match[1]);
  }, []);

  const switchLanguage = (langCode: string) => {
    setActiveLang(langCode);

    // Set googtrans cookie for Google Translate
    document.cookie = `googtrans=/en/${langCode};path=/;`;
    document.cookie = `googtrans=/en/${langCode};path=/;domain=${window.location.hostname};`;

    // Try using the hidden Google Translate select element
    const select = document.querySelector(
      ".goog-te-combo",
    ) as HTMLSelectElement | null;
    if (select) {
      select.value = langCode;
      select.dispatchEvent(new Event("change"));
    } else {
      // Fallback: reload to let Google Translate pick up the cookie
      window.location.reload();
    }
  };

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        id="sidebar-mobile-toggle"
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl bg-white border border-border shadow-md flex items-center justify-center hover:bg-surface-light transition-colors"
        aria-label="Open navigation"
      >
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
          <path
            d="M1 1h16M1 7h16M1 13h16"
            stroke="#475569"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        id="sidebar"
        className={`
          fixed md:sticky top-0 left-0 z-50 md:z-auto
          h-screen flex flex-col
          bg-white border-r border-border
          transition-all duration-300 ease-in-out
          ${collapsed ? "md:w-[72px]" : "md:w-[260px]"}
          ${isMobileOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full md:translate-x-0"}
          shadow-lg md:shadow-none
        `}
      >
        {/* Desktop Collapse Toggle */}
        <button
          id="sidebar-collapse-toggle"
          onClick={() => setCollapsed((c) => !c)}
          className={`hidden md:flex absolute -right-3 top-5 w-6 h-6 bg-white border border-border rounded-full items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-light transition-all shadow-sm z-50 cursor-pointer`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Brand header */}
        <div
          className={`flex items-center h-16 px-4 border-b border-border shrink-0 ${collapsed ? "justify-center" : "gap-3"}`}
        >
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <span
            className={`text-lg font-bold text-text-primary whitespace-nowrap overflow-hidden transition-all duration-300 ${
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            }`}
          >
            VoiceTrace
          </span>

          {/* Mobile close */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="md:hidden ml-auto w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-light transition-colors"
            aria-label="Close navigation"
          >
            <ChevronLeft className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Language Switcher */}
        <div
          className={`px-3 pt-4 pb-2 ${collapsed ? "flex flex-col items-center" : ""}`}
        >
          {!collapsed && (
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Languages className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">
                Language
              </span>
            </div>
          )}
          <div
            className={`flex ${collapsed ? "flex-col gap-1" : "gap-1"} ${collapsed ? "" : "bg-slate-100 p-1 rounded-xl"}`}
          >
            {LANGS.map((lang) => (
              <button
                key={lang.code}
                onClick={() => switchLanguage(lang.code)}
                className={`
                  ${collapsed ? "w-11 h-8 text-[11px]" : "flex-1 py-1.5 text-xs"}
                  rounded-lg font-semibold transition-all duration-200
                  ${
                    activeLang === lang.code
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary hover:bg-white/60"
                  }
                `}
                title={
                  lang.code === "en"
                    ? "English"
                    : lang.code === "hi"
                      ? "Hindi"
                      : "Marathi"
                }
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-3 border-t border-border" />

        {/* Nav links */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                id={`sidebar-nav-${item.label.toLowerCase()}`}
                className={`
                  group relative flex items-center rounded-xl transition-all duration-200
                  text-sm font-medium
                  ${collapsed ? "justify-center w-11 h-11 mx-auto gap-0 p-0" : "gap-3 px-3 py-2.5 w-full"}
                  ${
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm"
                      : "text-text-secondary hover:bg-surface-light hover:text-text-primary"
                  }
                `}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] bg-primary rounded-r-full transition-all duration-200 ${collapsed ? "h-0 opacity-0" : "h-5 opacity-100"}`}
                  />
                )}

                <Icon
                  className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? "text-primary" : "text-text-muted group-hover:text-text-secondary"}`}
                />

                <span
                  className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
                    collapsed
                      ? "w-0 opacity-0 hidden md:block md:w-0"
                      : "w-auto opacity-100"
                  }`}
                >
                  {item.label}
                </span>

                {/* Tooltip on collapsed */}
                {collapsed && (
                  <span className="hidden md:block absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-text-primary text-white text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-lg z-10">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
