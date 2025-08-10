"use client";

import { useEffect, useMemo, useState } from "react";
import convert, { Measure, Unit } from "convert-units";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ubuntu } from "@/lib/fonts";
import { Button } from "../ui/button";
import { ArrowLeftRight } from "lucide-react";

export default function UnitConverter() {
  const measures = convert().measures(); // Measure[]

  const [measure, setMeasure] = useState<Measure>("length");
  const [fromUnit, setFromUnit] = useState<Unit | "">("");
  const [toUnit, setToUnit] = useState<Unit | "">("");
  const [value, setValue] = useState<string>("");
  const [result, setResult] = useState<string>("");

  const units = useMemo(
    () => convert().possibilities(measure) as Unit[],
    [measure]
  );

  const labelFor = (u: Unit) => {
    const d = convert().describe(u);
    const name = d?.plural || d?.singular || u;
    return `${name} (${u})`;
  };

  useEffect(() => {
    if (units.length) {
      setFromUnit(units[0]);
      setToUnit(units[1] || units[0]);
    } else {
      setFromUnit("");
      setToUnit("");
    }
    setResult("");
  }, [measure, units.length]);

  useEffect(() => {
    const n = Number(value);
    if (!Number.isFinite(n) || !fromUnit || !toUnit) return setResult("");
    try {
      const out = convert(n).from(fromUnit).to(toUnit);

      const formatted =
        Math.abs(out) >= 1e6 || Math.abs(out) < 1e-4
          ? out.toExponential(4)
          : +out.toFixed(6);
      setResult(String(formatted));
    } catch {
      setResult("");
    }
  }, [value, fromUnit, toUnit]);

  const swap = () => {
    if (!fromUnit || !toUnit) return;
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  return (
    <section className={`${ubuntu.className} bg-transparent text-[#212121]`}>
      <div className="max-w-xl px-5">
        <h2 className={`${ubuntu.className} text-2xl md:text-3xl font-bold`}>
          Unit Converter
        </h2>
        <p className={`${ubuntu.className} mt-2 text-[#212121]/70 text-sm`}>
          Convert between any units within the same measurement type.
        </p>

        <Card className="mt-6 border-[#212121]/10 bg-[#212121]/[0.05] p-5">
          {/* Measurement type */}
          <div className="mb-5">
            <Label className="mb-2 block">Measurement type</Label>
            <Select
              value={measure}
              onValueChange={(v) => setMeasure(v as Measure)}
            >
              <SelectTrigger className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {measures.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block">Value</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
              />
            </div>

            <div>
              <Label className="mb-2 block">From</Label>
              <Select
                value={fromUnit}
                onValueChange={(v) => setFromUnit(v as Unit)}
              >
                <SelectTrigger className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121] w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {units.map((u) => (
                    <SelectItem key={u} value={u}>
                      {labelFor(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 flex justify-center rotate-90">
              <Button
                type="button"
                variant="secondary"
                onClick={swap}
                className="w-8 h-8 sm:w-12 sm:h-12 rounded-full shadow-md"
                title="Swap units"
              >
                <ArrowLeftRight className="h-5 w-5" />
                <span className="sr-only">Swap units</span>
              </Button>
            </div>

            {/* Result + To (row 3) */}
            <div>
              <Label className="mb-2 block">Result</Label>
              <Input
                value={result}
                readOnly
                className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
              />
            </div>

            <div>
              <Label className="mb-2 block">To</Label>
              <Select
                value={toUnit}
                onValueChange={(v) => setToUnit(v as Unit)}
              >
                <SelectTrigger className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121] w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {units.map((u) => (
                    <SelectItem key={u} value={u}>
                      {labelFor(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
