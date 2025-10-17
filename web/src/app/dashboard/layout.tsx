import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | LiveStatistik",
  description: "Statistics Dashboard",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
