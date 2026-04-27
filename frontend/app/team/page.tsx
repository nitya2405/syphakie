"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeamRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/account?tab=team"); }, [router]);
  return null;
}
