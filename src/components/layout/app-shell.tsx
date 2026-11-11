"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, CalendarClock, Database, FileChartColumn, FileText, LayoutDashboard, Library, Menu, ScanSearch, SlidersHorizontal, SlidersVertical, type LucideIcon } from "lucide-react";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { SettingsDialog } from "@/components/common/settings-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/provider";
import type { Messages } from "@/i18n/messages/ru";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useData } from "@/providers/data-provider";

interface NavItem {
  href: string;
  label: keyof Messages["nav"];
  icon: LucideIcon;
}

const ANALYTICS_NAV: NavItem[] = [
  { href: "/", label: "overview", icon: LayoutDashboard },
  { href: "/topics", label: "topics", icon: BookOpenCheck },
  { href: "/skills", label: "skills", icon: ScanSearch },
  { href: "/textbooks", label: "textbooks", icon: Library },
  { href: "/hours", label: "hours", icon: CalendarClock },
  { href: "/simulator", label: "simulator", icon: SlidersVertical },
  { href: "/reports", label: "reports", icon: FileChartColumn },
];

const DATA_NAV: NavItem[] = [
  { href: "/data", label: "import", icon: Database },
  { href: "/methodology", label: "methodology", icon: FileText },
];

function Logo() {
  const { m } = useI18n();
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30">
      {/* Столбцы и линия порога: тема либо дотягивает до нормы, либо нет. */}
      <svg viewBox="0 0 20 20" className="size-6 shrink-0" fill="none" aria-hidden>
        <rect x="2.5" y="12" width="3.5" height="6" rx="0.75" className="fill-level-low" />
        <rect x="8.25" y="5.5" width="3.5" height="12.5" rx="0.75" className="fill-primary" />
        <rect x="14" y="2.5" width="3.5" height="15.5" rx="0.75" className="fill-primary" />
        <path d="M1 9.25h18" className="stroke-foreground" strokeWidth="1.25" />
      </svg>
      <span className="leading-tight">
        <span className="block text-lg font-semibold tracking-[-0.025em]">{m.common.appName}</span>
        <span className="block text-[11px] text-muted-foreground">{m.common.appTagline}</span>
      </span>
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { m } = useI18n();
  return (
    <ul className="grid gap-0.5">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "sidebar-link flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
                active ? "sidebar-link-active" : "",
              )}
            >
              <item.icon className="size-4 shrink-0" strokeWidth={1.7} aria-hidden />
              {m.nav[item.label]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DatasetStatus() {
  const { dataset, status } = useData();
  const { m } = useI18n();
  if (!dataset) {
    return <div className="px-2.5 py-2 text-xs text-muted-foreground">{status === "error" ? m.shell.dataNotLoaded : m.common.loading}</div>;
  }
  return <DatasetStatusCard dataset={dataset} />;
}

function DatasetStatusCard({ dataset }: { dataset: NonNullable<ReturnType<typeof useData>["dataset"]> }) {
  const students = React.useMemo(() => new Set(dataset.records.map((r) => r.studentId)).size, [dataset.records]);
  const { m, t, plural } = useI18n();
  return (
    <Link href="/data" className="block rounded-md px-2.5 py-2 text-xs outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/30">
      <div className="flex items-center gap-1.5 font-medium">
        <span className={cn("size-1.5 rounded-full", dataset.meta.isSynthetic ? "bg-level-medium" : "bg-level-high")} aria-hidden />
        {dataset.meta.isSynthetic ? m.shell.demoData : m.shell.uploadedData}
      </div>
      <div className="mt-1 text-muted-foreground tabular">
        {t(m.shell.datasetSummary, { students: formatInt(students), answers: plural(m.counts.answers, dataset.records.length) })}
      </div>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { m } = useI18n();
  return (
    <div className="workspace-sidebar flex h-full flex-col gap-8 overflow-y-auto px-4 pt-6 pb-4">
      <Logo />
      <nav aria-label={m.nav.main} className="grid gap-5">
        <div>
          <div className="mb-1 px-2.5 text-xs font-medium text-muted-foreground">{m.nav.analytics}</div>
          <NavLinks items={ANALYTICS_NAV} onNavigate={onNavigate} />
        </div>
        <div>
          <div className="mb-1 px-2.5 text-xs font-medium text-muted-foreground">{m.nav.data}</div>
          <NavLinks items={DATA_NAV} onNavigate={onNavigate} />
        </div>
      </nav>
      <div className="mt-auto grid gap-1 border-t border-sidebar-border pt-3">
        <SettingsDialog
          trigger={
            <button
              type="button"
              className="sidebar-link flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {m.settings.title}
            </button>
          }
        />
        <LanguageSwitcher />
        <DatasetStatus />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { m } = useI18n();
  return (
    <div className="app-workspace min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a href="#main-content" className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">{m.nav.skipToContent}</a>
      <aside className="sticky top-0 hidden h-dvh border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
          <Logo />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={m.nav.openMenu}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetTitle className="sr-only">{m.nav.navigation}</SheetTitle>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1480px] px-4 py-6 outline-none sm:px-6 lg:px-9 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
