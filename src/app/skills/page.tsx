import type { Metadata } from "next";
import { SkillsView } from "@/components/views/skills-view";

export const metadata: Metadata = { title: "Анализ ошибок" };

export default function Page() {
  return <SkillsView />;
}
