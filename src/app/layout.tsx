import type { Metadata, Viewport } from "next";
import "@fontsource-variable/onest";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { DataProvider } from "@/providers/data-provider";
import { I18nProvider, LocaleScope } from "@/i18n/provider";

export const metadata: Metadata = {
  title: {
    default: "Data-Driven Curriculum",
    template: "%s · Data-Driven Curriculum",
  },
  description:
    "Аналитическая платформа для методистов: результаты тестирования по темам, сложные разделы, сравнение учебников и рекомендации по учебным часам.",
};

export const viewport: Viewport = {
  themeColor: "#f4f5f7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <I18nProvider>
          <DataProvider>
            <TooltipProvider>
              <LocaleScope>
                <AppShell>{children}</AppShell>
              </LocaleScope>
            </TooltipProvider>
            <Toaster />
          </DataProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
