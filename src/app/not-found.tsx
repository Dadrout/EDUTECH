import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="text-sm font-medium text-muted-foreground">404</div>
      <h1 className="text-xl font-semibold">Страница не найдена</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Проверьте адрес или вернитесь к обзору успеваемости.</p>
      <Button asChild className="mt-2">
        <Link href="/">На главную</Link>
      </Button>
    </div>
  );
}
