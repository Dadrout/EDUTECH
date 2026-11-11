"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";

export default function NotFound() {
  const { m } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="text-sm font-medium text-muted-foreground">404</div>
      <h1 className="text-xl font-semibold">{m.notFound.title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{m.notFound.text}</p>
      <Button asChild className="mt-2">
        <Link href="/">{m.notFound.home}</Link>
      </Button>
    </div>
  );
}
