import type { Metadata } from "next";
import { MethodologyView } from "@/components/views/methodology-view";

export const metadata: Metadata = { title: "Методика расчётов" };

export default function Page() {
  return <MethodologyView />;
}
