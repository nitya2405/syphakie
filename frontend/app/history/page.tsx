"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HistoryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/activity?tab=history"); }, [router]);
  return null;
}
