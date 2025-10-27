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
    <div className="min-h-screen flex flex-col bg-white">
      <DashboardHeader />
      {children}
    </div>
  );
}
