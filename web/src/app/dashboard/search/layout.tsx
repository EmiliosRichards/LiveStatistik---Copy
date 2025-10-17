import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Statistics | LiveStatistik",
  description: "Search agent and campaign statistics",
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
