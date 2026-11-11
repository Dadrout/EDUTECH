import type { Metadata } from "next";
import { TopicsView } from "@/components/views/topics-view";

export const metadata: Metadata = { title: "Анализ тем" };

export default function Page() {
  return <TopicsView />;
}
