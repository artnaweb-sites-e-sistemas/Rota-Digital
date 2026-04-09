import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard - Rota Digital",
  description: "Area restrita do Rota Digital",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
