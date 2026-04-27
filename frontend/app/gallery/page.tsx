"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GalleryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/activity?tab=gallery"); }, [router]);
  return null;
}
