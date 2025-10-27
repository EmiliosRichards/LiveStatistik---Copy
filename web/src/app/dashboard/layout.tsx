import type { Metadata } from "next";
import DashboardHeader from "@/components/DashboardHeader";

export const metadata: Metadata = {
  title: "Dashboard | LiveStatistik",
  description: "Statistics Dashboard",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-slate-100">
      <DashboardHeader />
      {children}
    </div>
  );
}
