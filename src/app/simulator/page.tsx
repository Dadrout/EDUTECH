import type { Metadata } from "next";
import { HoursView } from "@/components/views/hours-view";

export const metadata: Metadata = { title: "Симулятор учебного плана" };

export default function Page() {
  return <HoursView scenarioOnly />;
}
