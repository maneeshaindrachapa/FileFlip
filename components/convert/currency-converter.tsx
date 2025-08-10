"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight } from "lucide-react";
import { useFx } from "@/lib/currency-converter/fx";
import { ubuntu } from "@/lib/fonts";

const COMMON = [
  "EUR",
  "USD",
  "GBP",
  "JPY",
  "CHF",
  "AUD",
  "CAD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "TRY",
  "CNY",
  "INR",
];

export default function CurrencyConverter() {
  const base = "USD";
  const { data, loading, err } = useFx(base);

  const all = useMemo(
    () => (data ? [data.base, ...Object.keys(data.rates)].sort() : []),
    [data]
  );

  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState("USD");
  const [amount, setAmount] = useState("1");
  const date = data?.date ?? "";

  const convert = () => {
    const n = Number(amount || "0");
    if (!data || !Number.isFinite(n)) return "";
    if (from === to) return n.toString();

    const r = (c: string) => (c === data.base ? 1 : data.rates[c]);
    if (!r(from) || !r(to)) return "";

    const eur = n / r(from);
    const out = eur * r(to);

    return out >= 1e6 || out < 1e-4
      ? out.toExponential(4)
      : (+out.toFixed(6)).toString();
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <section className="bg-transparent text-[#212121]">
      <div className={`${ubuntu.className} max-w-xl px-5`}>
        <h2 className="text-2xl md:text-3xl font-bold">Currency Converter</h2>
        {date && (
          <p className="mt-2 text-[#212121]/70 text-xs">
            Last update:{" "}
            <span className="text-[#212121]/70">{date} ~16:00 CET</span>
          </p>
        )}

        <Card className="mt-6 border-[#212121]/10 bg-[#212121]/[0.05] p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block">Amount</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
              />
            </div>
            <div>
              <Label className="mb-2 block">From</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {[...new Set([...COMMON, ...all])].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 flex justify-center rotate-90">
              <Button
                variant="secondary"
                onClick={swap}
                className="w-full sm:w-12 sm:h-12 rounded-full"
                title="Swap"
              >
                <ArrowLeftRight className="h-5 w-5" />
                <span className="sr-only">Swap</span>
              </Button>
            </div>

            <div>
              <Label className="mb-2 block">Result</Label>
              <Input
                readOnly
                value={convert()}
                className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
              />
            </div>
            <div>
              <Label className="mb-2 block">To</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {[...new Set([...COMMON, ...all])].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading && (
            <p className="mt-3 text-sm text-[#212121]/60">Loading rates…</p>
          )}
          {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
        </Card>
      </div>
    </section>
  );
}
