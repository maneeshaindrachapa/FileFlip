"use client";

import { useMemo, useRef, useState } from "react";
import {
  ACCEPTED_AUDIO_EXTS,
  convertAudioBrowser,
  makeDownloadUrlFromResult,
  supportedTargets,
  type AudioTarget,
} from "@/lib/audio-utils";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ubuntu } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

type Props = {
  onConvert?: (count: number) => void;
};

const ACCEPT = ACCEPTED_AUDIO_EXTS.join(", ");

export default function AudioConverter({ onConvert }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<AudioTarget>("mp3");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [outUrl, setOutUrl] = useState("");
  const [outName, setOutName] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const canConvert = useMemo(() => !!file && !busy, [file, busy]);

  const onPick = () => inputRef.current?.click();

  const resetOutput = () => {
    if (outUrl) URL.revokeObjectURL(outUrl);
    setOutUrl("");
    setOutName("");
  };

  const onFile = (f: File | null) => {
    setError("");
    setProgress(0);
    resetOutput();
    setFile(null);
    if (!f) return;

    const ext = f.name.includes(".")
      ? "." + f.name.split(".").pop()!.toLowerCase()
      : "";

    if (
      !ACCEPTED_AUDIO_EXTS.includes(ext as (typeof ACCEPTED_AUDIO_EXTS)[number])
    ) {
      setError(
        `Unsupported file type: ${ext || "(none)"} • Accepted: ${ACCEPT}`
      );
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError("File is larger than 100 MB.");
      return;
    }
    setFile(f);
  };

  const doConvert = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setProgress(0);
    resetOutput();

    try {
      const result = await convertAudioBrowser(file, target, (r) =>
        setProgress(Math.round(r * 100))
      );
      const { url, name } = makeDownloadUrlFromResult(result);
      setOutUrl(url);
      setOutName(name);
      setProgress(100);
      onConvert?.(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="audio" className="bg-transparent text-[#212121] scroll-mt-20">
      <div className={`${ubuntu.className} max-w-3xl px-5`}>
        <h2 className="text-2xl md:text-3xl font-bold">Audio Converter</h2>
        <p className="mt-2 text-sm text-[#212121]/70">
          Pick a file(≤ 100 MB) and hit <b>Convert</b>.
        </p>

        <Card className="mt-6 border-[#212121]/10 bg-[#212121]/[0.04] p-5">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0] || null);
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition",
              "border-[#212121]/15 bg-white"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
            />
            <div className="text-sm text-[#212121]/70">
              <div className="font-medium text-[#212121]">
                {file ? file.name : "Drag & drop your audio file here"}
              </div>
              <div className="mt-1 text-xs">
                or{" "}
                <button
                  className="underline underline-offset-4"
                  onClick={onPick}
                  type="button"
                >
                  browse
                </button>
              </div>
              <div className="mt-2 text-xs">Supported: {ACCEPT}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="min-w-0">
              <Label htmlFor="tgt" className="mb-2 block">
                Target format
              </Label>
              <Select
                value={target}
                onValueChange={(v) => setTarget(v as AudioTarget)}
              >
                <SelectTrigger id="tgt" className="w-full">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent className="max-h-60 w-[--radix-select-trigger-width]">
                  {supportedTargets().map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={doConvert}
              disabled={!canConvert}
              className="w-full sm:w-auto sm:min-w-[6.5rem]"
            >
              {busy ? "Converting…" : "Convert"}
            </Button>

            <Button
              variant="ghost"
              onClick={() => {
                setFile(null);
                setError("");
                setProgress(0);
                resetOutput();
              }}
              disabled={busy}
              className="w-full sm:w-auto sm:min-w-[6.5rem] hover:bg-black/70 hover:text-white border border-[#212121]/10"
            >
              Reset
            </Button>
          </div>

          {(progress > 0 || error) && (
            <div className="space-y-2">
              {progress > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Converting…</span>
                    <span>{Math.min(progress, 100)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </>
              )}
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}

          {outUrl && !busy && (
            <div className="flex flex-col items-center gap-2">
              <Button asChild>
                <a
                  href={outUrl}
                  download={outName}
                  title={`Download ${outName}`}
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">{outName}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Note: Some formats may fail depending on the core build & codecs.
            The first run may take longer while the WASM core loads.
          </p>
        </Card>
      </div>
    </section>
  );
}
