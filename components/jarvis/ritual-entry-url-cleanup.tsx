"use client";

import { useEffect } from "react";

export function RitualEntryUrlCleanup() {
  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.get("ritualEntry") !== "complete") {
      return;
    }

    url.searchParams.delete("ritualEntry");
    const cleanUrl = url.pathname + url.search + url.hash;
    window.history.replaceState(window.history.state, "", cleanUrl);
  }, []);

  return null;
}
