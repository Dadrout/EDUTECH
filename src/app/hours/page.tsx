import type { Metadata } from "next";
import { HoursView } from "@/components/views/hours-view";

export const metadata: Metadata = { title: "Учебные часы" };

export default function Page() {
  return <HoursView />;
}
