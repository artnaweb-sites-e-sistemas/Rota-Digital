import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard - RouteLAB",
  description: "Area restrita da RouteLAB",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
