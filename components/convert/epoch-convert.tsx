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
import { Copy, RefreshCw } from "lucide-react";
import { ubuntu } from "@/lib/fonts";
import { cn } from "@/lib/utils";

/* ---------- tiny utils ---------- */
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

/* ---------- component ---------- */
export default function EpochConverter() {
  /* Live clock */
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const nowSec = Math.floor(nowMs / 1000);

  /* Epoch → Human (user-editable; initialize once, don't auto-update) */
  const [e2hValue, setE2hValue] = useState<string>("");
  const [e2hUnit, setE2hUnit] = useState<"seconds" | "milliseconds">("seconds");
  const [e2hZone, setE2hZone] = useState<Zone>("local");

  /* Human → Epoch (keeps syncing with live clock) */
  const [h2eZone, setH2eZone] = useState<Zone>("local");
  const [h2eDate, setH2eDate] = useState<string>("");
  const [h2eTime, setH2eTime] = useState<string>("");
  const [h2eMs, setH2eMs] = useState<string>("0");

  // Initialize once on mount:
  useEffect(() => {
    const ms = Date.now();
    // set the input only once
    setE2hValue(String(Math.floor(ms / 1000))); // default to seconds
  }, []);

  // Live updates (every 250ms): update display clock + Human→Epoch fields.
  useEffect(() => {
    const update = () => {
      const ms = Date.now();
      setNowMs(ms);

      // keep human→epoch inputs synced to "now"
      const d = new Date(ms);
      if (h2eZone === "utc") {
        setH2eDate(
          `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
            d.getUTCDate()
          )}`
        );
        setH2eTime(
          `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(
            d.getUTCSeconds()
          )}`
        );
        setH2eMs(String(d.getUTCMilliseconds()));
      } else {
        setH2eDate(
          `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
        );
        setH2eTime(
          `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
            d.getSeconds()
          )}`
        );
        setH2eMs(String(d.getMilliseconds()));
      }
    };
    update();
    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [h2eZone]);

  /* Derived values */
  const e2hDateObj = useMemo(() => {
    if (!e2hValue) return null;
    const n = Number(e2hValue);
    if (!Number.isFinite(n)) return null;
    const ms = e2hUnit === "seconds" ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [e2hValue, e2hUnit]);

  const h2eEpochMs = useMemo(
    () => toEpochMsFromParts(h2eDate, h2eTime, h2eMs, h2eZone),
    [h2eDate, h2eTime, h2eMs, h2eZone]
  );
  const h2eEpochSec = Number.isFinite(h2eEpochMs)
    ? Math.floor(h2eEpochMs / 1000)
    : NaN;

  /* helpers */
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

        {/* Current Unix time */}
        <Card className="mt-6 border-[#212121]/10 bg-[#212121]/[0.05] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-sm text-[#212121]/70">Current Unix time</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">
                {nowSec}{" "}
                <span className="text-base text-[#212121]/60">sec</span>
              </div>
              <div className="mt-1 text-lg tabular-nums">
                {nowMs}{" "}
                <span className="text-sm text-[#212121]/60">milliseconds</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setNowMs(Date.now())}
                className="shrink-0 hover:bg-black hover:text-white"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="secondary"
                onClick={() => copy(String(nowSec))}
                className="shrink-0 hover:bg-black hover:text-white"
                title="Copy seconds"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy sec
              </Button>
            </div>
          </div>
        </Card>

        {/* Converters grid */}
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
                      {e2hZone === "utc"
                        ? e2hDateObj.toISOString()
                        : e2hDateObj.toString()}
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

          {/* HUMAN -> EPOCH */}
          <Card className="border-[#212121]/10 bg-[#212121]/[0.05] p-5">
            <h3 className="text-lg font-semibold">Human → Epoch</h3>

            <div className="mt-4 grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Date</Label>
                  <Input
                    type="date"
                    value={h2eDate}
                    onChange={(e) => setH2eDate(e.target.value)}
                    className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Time</Label>
                  <Input
                    type="time"
                    step="1"
                    value={h2eTime}
                    onChange={(e) => setH2eTime(e.target.value)}
                    className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Milliseconds</Label>
                  <Input
                    type="number"
                    min={0}
                    max={999}
                    value={h2eMs}
                    onChange={(e) => setH2eMs(e.target.value)}
                    className="bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      // snap to current "now" without waiting for next tick
                      const d = new Date();
                      if (h2eZone === "utc") {
                        setH2eDate(
                          `${d.getUTCFullYear()}-${pad2(
                            d.getUTCMonth() + 1
                          )}-${pad2(d.getUTCDate())}`
                        );
                        setH2eTime(
                          `${pad2(d.getUTCHours())}:${pad2(
                            d.getUTCMinutes()
                          )}:${pad2(d.getUTCSeconds())}`
                        );
                        setH2eMs(String(d.getUTCMilliseconds()));
                      } else {
                        setH2eDate(
                          `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
                            d.getDate()
                          )}`
                        );
                        setH2eTime(
                          `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
                            d.getSeconds()
                          )}`
                        );
                        setH2eMs(String(d.getMilliseconds()));
                      }
                    }}
                    className="w-full hover:bg-black hover:text-white"
                  >
                    Use now
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Label className="text-sm">Interpret as</Label>
                <Select
                  value={h2eZone}
                  onValueChange={(v) => setH2eZone(v as Zone)}
                >
                  <SelectTrigger className="h-9 w-32 bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="utc">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
                        variant="secondary"
                        onClick={() => copy(String(h2eEpochSec))}
                        className="hover:bg-black hover:text-white"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#212121]/10">
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
                        variant="secondary"
                        onClick={() => copy(String(h2eEpochMs))}
                        className="hover:bg-black hover:text-white"
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
      </div>
    </section>
  );
}
