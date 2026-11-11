"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, CalendarClock, Database, FileText, LayoutDashboard, Library, Menu, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { SettingsDialog } from "@/components/common/settings-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useData } from "@/providers/data-provider";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ANALYTICS_NAV: NavItem[] = [
  { href: "/", label: "Обзор", icon: LayoutDashboard },
  { href: "/topics", label: "Анализ тем", icon: BookOpenCheck },
  { href: "/textbooks", label: "Сравнение учебников", icon: Library },
  { href: "/hours", label: "Учебные часы", icon: CalendarClock },
];

const DATA_NAV: NavItem[] = [
  { href: "/data", label: "Данные и импорт", icon: Database },
  { href: "/methodology", label: "Методика расчётов", icon: FileText },
];

function Logo() {
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
        <span className="block text-[13px] font-semibold tracking-tight">Data-Driven Curriculum</span>
        <span className="block text-[11px] text-muted-foreground">Аналитика для методистов</span>
      </span>
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
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
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
                active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-4", active ? "text-primary" : "")} aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DatasetStatus() {
  const { dataset, status } = useData();
  if (!dataset) {
    return <div className="px-2.5 py-2 text-xs text-muted-foreground">{status === "error" ? "Данные не загружены" : "Загрузка данных…"}</div>;
  }
  return <DatasetStatusCard dataset={dataset} />;
}

function DatasetStatusCard({ dataset }: { dataset: NonNullable<ReturnType<typeof useData>["dataset"]> }) {
  const students = React.useMemo(() => new Set(dataset.records.map((r) => r.studentId)).size, [dataset.records]);
  return (
    <Link href="/data" className="block rounded-md px-2.5 py-2 text-xs outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/30">
      <div className="flex items-center gap-1.5 font-medium">
        <span className={cn("size-1.5 rounded-full", dataset.meta.isSynthetic ? "bg-level-medium" : "bg-level-high")} aria-hidden />
        {dataset.meta.isSynthetic ? "Демо: синтетические данные" : "Загруженные данные"}
      </div>
      <div className="mt-1 text-muted-foreground tabular">
        {formatInt(students)} уч. · {formatInt(dataset.records.length)} ответов
      </div>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo />
      <nav aria-label="Основная навигация" className="grid gap-5">
        <div>
          <div className="mb-1 px-2.5 text-xs font-medium text-muted-foreground">Аналитика</div>
          <NavLinks items={ANALYTICS_NAV} onNavigate={onNavigate} />
        </div>
        <div>
          <div className="mb-1 px-2.5 text-xs font-medium text-muted-foreground">Данные</div>
          <NavLinks items={DATA_NAV} onNavigate={onNavigate} />
        </div>
      </nav>
      <div className="mt-auto grid gap-1 border-t border-sidebar-border pt-3">
        <SettingsDialog
          trigger={
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              Параметры анализа
            </button>
          }
        />
        <DatasetStatus />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
          <Logo />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Открыть меню">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetTitle className="sr-only">Навигация</SheetTitle>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
