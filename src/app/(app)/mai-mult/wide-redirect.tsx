"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** "Mai mult" is the phone's menu: from 820 px the sidebar lists everything, so this page sends to Acasă. */
export function WideRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia("(min-width: 820px)").matches) router.replace("/");
  }, [router]);
  return null;
}
