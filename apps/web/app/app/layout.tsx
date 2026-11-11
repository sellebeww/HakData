// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const r = useRouter();
  useEffect(() => {
    if (!loading && !me) r.replace("/masuk");
  }, [loading, me, r]); // guard UX saja; otorisasi sebenarnya di backend
  if (loading || !me)
    return (
      <div className="page">
        <Skeleton h={200} />
      </div>
    );
  return <>{children}</>;
}
