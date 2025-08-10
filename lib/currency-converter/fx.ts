"use client";
import { useEffect, useState } from "react";

type Rates = Record<string, number>;
type FxState = { base: string; date: string; rates: Rates };

export function useFx(base = "EUR") {
  const [data, setData] = useState<FxState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        // Frankfurter: latest rates with chosen base (ECB derived)
        const res = await fetch(
          `https://api.frankfurter.dev/v1/latest?base=${base}`,
          {
            cache: "force-cache", // let Next/browser cache
          }
        );
        if (!res.ok) throw new Error("Failed to fetch rates");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e: any) {
        setErr(e?.message || "FX fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base]);

  return { data, loading, err };
}
