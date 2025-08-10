"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Copy, RefreshCw, Calendar as CalendarIcon } from "lucide-react";
import { ubuntu } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type Zone = "utc" | "local";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function formatHuman(d: Date, mode: Zone) {
  if (mode === "utc") {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
      d.getUTCDate()
    )} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(
      d.getUTCSeconds()
    )} UTC`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
    d.getSeconds()
  )} (local)`;
}
function toEpochMsFromParts(
  dateStr: string,
  timeStr: string,
  msStr: string,
  zone: Zone
) {
  if (!dateStr || !timeStr) return NaN;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss = "0"] = timeStr.split(":");
  const ms = Number(msStr || "0");
  if ([y, m, d].some((x) => Number.isNaN(x))) return NaN;

  if (zone === "utc") {
    return Date.UTC(
      y,
      (m || 1) - 1,
      d || 1,
      Number(hh || "0"),
      Number(mm || "0"),
      Number(ss || "0"),
      ms
    );
  }
  const dt = new Date(
    y,
    (m || 1) - 1,
    d || 1,
    Number(hh || "0"),
    Number(mm || "0"),
    Number(ss || "0"),
    ms
  );
  return dt.getTime();
}

/* helpers for time selects */
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINS = Array.from({ length: 60 }, (_, i) => pad2(i));
const SECS = Array.from({ length: 60 }, (_, i) => pad2(i));

export default function EpochConverter() {
  // Live clock (for the top card only)
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const nowSec = Math.floor(nowMs / 1000);

  // Epoch → Human
  const [e2hValue, setE2hValue] = useState<string>("");
  const [e2hUnit, setE2hUnit] = useState<"seconds" | "milliseconds">("seconds");
  const [e2hZone, setE2hZone] = useState<Zone>("local");

  // Human → Epoch (NO auto updates)
  const [h2eZone, setH2eZone] = useState<Zone>("local");
  const [hDate, setHDate] = useState<Date | undefined>(undefined);
  const [hHour, setHHour] = useState<string>("00");
  const [hMin, setHMin] = useState<string>("00");
  const [hSec, setHSec] = useState<string>("00");
  const [hMs, setHMs] = useState<string>("0");

  // init once
  useEffect(() => {
    const ms = Date.now();
    setE2hValue(String(Math.floor(ms / 1000)));

    const d = new Date(ms);
    setHDate(d);
    setHHour(pad2(d.getHours()));
    setHMin(pad2(d.getMinutes()));
    setHSec(pad2(d.getSeconds()));
    setHMs(String(d.getMilliseconds()));
  }, []);

  // live seconds/milliseconds for display only
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  /* Derived values */
  const e2hDateObj = useMemo(() => {
    if (!e2hValue) return null;
    const n = Number(e2hValue);
    if (!Number.isFinite(n)) return null;
    const ms = e2hUnit === "seconds" ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [e2hValue, e2hUnit]);

  const h2eDateStr = useMemo(() => {
    if (!hDate) return "";
    const y = h2eZone === "utc" ? hDate.getUTCFullYear() : hDate.getFullYear();
    const m =
      h2eZone === "utc" ? hDate.getUTCMonth() + 1 : hDate.getMonth() + 1;
    const d = h2eZone === "utc" ? hDate.getUTCDate() : hDate.getDate();
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }, [hDate, h2eZone]);

  const h2eTimeStr = `${hHour}:${hMin}:${hSec}`;

  const h2eEpochMs = useMemo(
    () =>
      hDate ? toEpochMsFromParts(h2eDateStr, h2eTimeStr, hMs, h2eZone) : NaN,
    [h2eDateStr, h2eTimeStr, hMs, h2eZone, hDate]
  );
  const h2eEpochSec = Number.isFinite(h2eEpochMs)
    ? Math.floor(h2eEpochMs / 1000)
    : NaN;

  const copy = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
    } catch {}
  };

  return (
    <section className={cn(ubuntu.className, "text-[#212121]")}>
      <div className="mx-auto max-w-6xl px-5 pb-12 pt-4">
        <h2 className="text-2xl md:text-3xl font-bold">Epoch Converter</h2>
        <p className="mt-2 text-[#212121]/70">
          Live Unix time and two-way conversion (UTC or local).
        </p>

        <Card className="mt-6 border-[#212121]/5 bg-[#212121]/[0.05] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-sm text-[#212121]/70">Current Unix time</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">
                {nowSec}{" "}
                <span className="text-base text-[#212121]/60">sec</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setNowMs(Date.now())}
                className="shrink-0 hover:bg-black hover:text-white"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => copy(String(nowSec))}
                className="shrink-0 hover:bg-black hover:text-white"
                title="Copy seconds"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy sec
              </Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* EPOCH -> HUMAN */}
            <Card className="border-[#212121]/10 bg-[#212121]/[0.05] p-5">
              <h3 className="text-lg font-semibold">Epoch → Human</h3>

              <div className="mt-4 grid gap-4">
                <div>
                  <Label className="mb-2 block">Epoch value</Label>
                  <Input
                    value={e2hValue}
                    onChange={(e) => setE2hValue(e.target.value)}
                    placeholder="e.g. 1700000000"
                    className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
                  />

                  <div className="grid gap-3 sm:grid-cols-2 mt-4">
                    {/* Unit */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                      <Label className="mb-1 sm:mb-0 text-sm">Unit</Label>
                      <Select
                        value={e2hUnit}
                        onValueChange={(v) =>
                          setE2hUnit(v as "seconds" | "milliseconds")
                        }
                      >
                        <SelectTrigger className="h-9 w-full sm:w-44 bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                          <SelectValue placeholder="Seconds" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seconds">Seconds</SelectItem>
                          <SelectItem value="milliseconds">
                            Milliseconds
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* View as */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                      <Label className="mb-1 sm:mb-0 text-sm">View as</Label>
                      <Select
                        value={e2hZone}
                        onValueChange={(v) => setE2hZone(v as Zone)}
                      >
                        <SelectTrigger className="h-9 w-full sm:w-36 bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                          <SelectValue placeholder="Local" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local</SelectItem>
                          <SelectItem value="utc">UTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-[#212121]/10 bg-white/50 p-3">
                  {e2hDateObj ? (
                    <>
                      <div className="text-sm text-[#212121]/60">Formatted</div>
                      <div className="font-medium">
                        {formatHuman(e2hDateObj, e2hZone)}
                      </div>
                      <div className="mt-2 text-sm text-[#212121]/60">
                        ISO 8601
                      </div>
                      <div className="font-mono text-sm break-all">
                        {e2hZone === "utc" ? (
                          <>
                            <div>{e2hDateObj.toISOString()}</div>
                            <div className="text-xs text-gray-500">UTC</div>
                          </>
                        ) : (
                          (() => {
                            const [datePart, tzPart] = e2hDateObj
                              .toString()
                              .split(" (");
                            const timezoneName = tzPart?.replace(")", "");
                            return (
                              <>
                                <div>{datePart}</div>
                                <div className="text-xs text-gray-500">
                                  {timezoneName}
                                </div>
                              </>
                            );
                          })()
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-red-500">
                      Invalid epoch value
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* HUMAN -> EPOCH (NO auto update) */}
            <Card className="border-[#212121]/10 bg-[#212121]/[0.05] p-5">
              <h3 className="text-lg font-semibold">Human → Epoch</h3>

              <div className="mt-4 grid gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full">
                  {/* Label + Select */}
                  <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
                    <Label className="text-sm shrink-0">Interpret as</Label>
                    <Select
                      value={h2eZone}
                      onValueChange={(v) => setH2eZone(v as Zone)}
                    >
                      <SelectTrigger className="h-9 w-full sm:w-40 bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="w-[--radix-select-trigger-width] max-h-60">
                        <SelectItem value="local">Local</SelectItem>
                        <SelectItem value="utc">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Use now */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const d = new Date();
                      setHDate(d);
                      setHHour(
                        pad2(h2eZone === "utc" ? d.getUTCHours() : d.getHours())
                      );
                      setHMin(
                        pad2(
                          h2eZone === "utc" ? d.getUTCMinutes() : d.getMinutes()
                        )
                      );
                      setHSec(
                        pad2(
                          h2eZone === "utc" ? d.getUTCSeconds() : d.getSeconds()
                        )
                      );
                      setHMs(
                        String(
                          h2eZone === "utc"
                            ? d.getUTCMilliseconds()
                            : d.getMilliseconds()
                        )
                      );
                    }}
                    className="w-full sm:w-auto sm:ml-auto hover:bg-black hover:text-white"
                  >
                    Use now
                  </Button>
                </div>

                <div className="md:hidden space-y-3">
                  {/* Date */}
                  <div className="gap-2">
                    <Label className="mb-1">Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "min-w-full justify-start text-left font-normal truncate",
                            "bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          {hDate
                            ? h2eZone === "utc"
                              ? `${hDate.getUTCFullYear()}-${pad2(
                                  hDate.getUTCMonth() + 1
                                )}-${pad2(hDate.getUTCDate())}`
                              : `${hDate.getFullYear()}-${pad2(
                                  hDate.getMonth() + 1
                                )}-${pad2(hDate.getDate())}`
                            : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-50" align="start">
                        <Calendar
                          mode="single"
                          selected={hDate}
                          onSelect={setHDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Time: HH MM SS */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="min-w-0">
                      <Label className="mb-1 block">Hour</Label>
                      <Select value={hHour} onValueChange={setHHour}>
                        <SelectTrigger className="h-9 w-full bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 w-[--radix-select-trigger-width]">
                          {HOURS.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="min-w-0">
                      <Label className="mb-1 block">Minute</Label>
                      <Select value={hMin} onValueChange={setHMin}>
                        <SelectTrigger className="h-9 w-full bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 w=[--radix-select-trigger-width]">
                          {MINS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="min-w-0">
                      <Label className="mb-1 block">Second</Label>
                      <Select value={hSec} onValueChange={setHSec}>
                        <SelectTrigger className="h-9 w-full bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 w-[--radix-select-trigger-width]">
                          {SECS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="hidden md:grid md:grid-cols-4 md:gap-3">
                  {/* Date */}
                  <div className="min-w-0">
                    <Label className="mb-1 block">Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal truncate",
                            "bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          {hDate
                            ? h2eZone === "utc"
                              ? `${hDate.getUTCFullYear()}-${pad2(
                                  hDate.getUTCMonth() + 1
                                )}-${pad2(hDate.getUTCDate())}`
                              : `${hDate.getFullYear()}-${pad2(
                                  hDate.getMonth() + 1
                                )}-${pad2(hDate.getDate())}`
                            : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-50" align="start">
                        <Calendar
                          mode="single"
                          selected={hDate}
                          onSelect={setHDate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Hour */}
                  <div className="min-w-0">
                    <Label className="mb-1 block">Hour</Label>
                    <Select value={hHour} onValueChange={setHHour}>
                      <SelectTrigger className="h-9 w-full bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 w-[--radix-select-trigger-width]">
                        {HOURS.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Minute */}
                  <div className="min-w-0">
                    <Label className="mb-1 block">Minute</Label>
                    <Select value={hMin} onValueChange={setHMin}>
                      <SelectTrigger className="h-9 w-full bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 w-[--radix-select-trigger-width]">
                        {MINS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Second */}
                  <div className="min-w-0">
                    <Label className="mb-1 block">Second</Label>
                    <Select value={hSec} onValueChange={setHSec}>
                      <SelectTrigger className="h-9 w-full bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 w-[--radix-select-trigger-width]">
                        {SECS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Output */}
                <div className="rounded-md border border-[#212121]/10 bg-white/50 p-3">
                  {Number.isFinite(h2eEpochMs) ? (
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm text-[#212121]/60">
                            Unix time (seconds)
                          </div>
                          <div className="font-mono text-lg tabular-nums">
                            {h2eEpochSec}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copy(String(h2eEpochSec))}
                          className="hover:bg-black hover:text-white border-solid border-[#212121]/10 border-1"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </Button>
                      </div>

                      <div className="hidden md:flex items-center justify-between gap-3 pt-2 border-t border-[#212121]/10">
                        <div>
                          <div className="text-sm text-[#212121]/60">
                            Unix time (milliseconds)
                          </div>
                          <div className="font-mono text-lg tabular-nums break-all">
                            {h2eEpochMs}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copy(String(h2eEpochMs))}
                          className="hover:bg-black hover:text-white border-solid border-[#212121]/10 border-1"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-red-500">
                      Invalid date/time input
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </Card>
      </div>
    </section>
  );
}
