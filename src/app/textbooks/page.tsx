import type { Metadata } from "next";
import { TextbooksView } from "@/components/views/textbooks-view";

export const metadata: Metadata = { title: "Сравнение учебников" };

export default function Page() {
  return <TextbooksView />;
}
