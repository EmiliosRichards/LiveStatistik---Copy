"use client";
import { useMemo } from "react";

export default function StatisticsPage() {
  // Allow override via env; default to local Express app
  const base = process.env.NEXT_PUBLIC_EXPRESS_BASE_URL || "http://localhost:5000";
  const url = useMemo(() => {
    const u = new URL(base);
    // Tell the client app it's embedded so it can hide controls
    u.searchParams.set("embed", "1");
    return u.toString();
  }, [base]);

  // Full-viewport embed to avoid layout clipping in some browsers
  return (
    <iframe
      src={url}
      className="fixed inset-0 w-screen h-screen border-0"
      title="Statistics"
      referrerPolicy="no-referrer"
    />
  );
}


