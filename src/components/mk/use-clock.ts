import { useEffect, useState } from "react";

/** Ticks every `ms` after hydration; returns Date.now() (0 on server). */
export function useClock(ms = 250) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function formatDuration(totalMs: number) {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
