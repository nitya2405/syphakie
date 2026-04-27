"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnalyticsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/activity?tab=analytics"); }, [router]);
  return null;
}
