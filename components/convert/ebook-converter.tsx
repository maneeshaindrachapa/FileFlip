"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ubuntu } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

import {
  swapExt,
  parseAnyToModel,
  exportModel,
  sniffSource,
  type TargetFmt,
  type SourceKind,
} from "@/lib/ebook-utils";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = [
  ".epub",
  ".pdf",
  ".cbz",
  ".fb2",
  ".html",
  ".htm",
  ".htmlz",
  ".txt",
  ".txtz",
] as const;

type Props = {
  onConvert?: (count: number) => void;
};

export default function EbookConverter({ onConvert }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<TargetFmt>("pdf");
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [converting, setConverting] = useState(false);

  const [outUrl, setOutUrl] = useState<string>("");
  const [outName, setOutName] = useState<string>("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const canConvert = useMemo(() => !!file && file.size <= MAX_BYTES, [file]);

  const sourceKind: SourceKind | null = useMemo(() => {
    if (!file) return null;
    return sniffSource(file.name);
  }, [file]);

  // Allowed targets per sourceKind
  const allowedTargets: TargetFmt[] = useMemo(() => {
    switch (sourceKind) {
      case "pdf":
        // we have image-based model; text-based routes also possible
        return ["epub", "pdf", "html", "md", "txt", "rtf", "docx"];
      case "epub":
      case "fb2":
      case "html":
      case "htmlz":
      case "txt":
      case "txtz":
        return ["epub", "pdf", "html", "md", "txt", "rtf", "docx"];
      case "cbz":
        return ["epub", "pdf", "html"];
      default:
        return ["pdf", "txt", "epub", "html", "md", "rtf", "docx"];
    }
  }, [sourceKind]);

  const onPick = () => inputRef.current?.click();

  useEffect(() => {
    return () => {
      if (outUrl) URL.revokeObjectURL(outUrl);
    };
  }, [outUrl]);

  const clearOutput = useCallback(() => {
    if (outUrl) URL.revokeObjectURL(outUrl);
    setOutUrl("");
    setOutName("");
  }, [outUrl]);

  const onFile = useCallback(
    (f: File | null) => {
      setError("");
      setProgress(0);
      clearOutput();
      setFile(null);
      if (!f) return;

      const dot = f.name.lastIndexOf(".");
      const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";

      if (!(ACCEPTED as readonly string[]).includes(String(ext))) {
        setError(
          `Unsupported file type: ${
            ext || "(none)"
          }. Supported: ${ACCEPTED.join(", ")}.`
        );
        return;
      }
      if (f.size > MAX_BYTES) {
        setError("File is larger than 50 MB. Please choose a smaller file.");
        return;
      }

      // sensible default target
      const kind = sniffSource(f.name);
      setTarget(kind === "pdf" ? "epub" : "pdf");
      setFile(f);
    },
    [clearOutput]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0] || null;
      onFile(f);
    },
    [onFile]
  );

  const convert = async (f: File, t: TargetFmt) => {
    setError("");
    setProgress(5);
    setConverting(true);
    clearOutput();

    try {
      setProgress(10);
      const model = await parseAnyToModel(f, (p) =>
        setProgress(10 + Math.round(p * 70))
      );

      setProgress(85);
      const out = await exportModel(model, t);

      let blob: Blob;
      if (out instanceof Uint8Array) {
        // Ensure we pass an ArrayBuffer, not a Uint8Array<ArrayBufferLike>
        const ab = out.buffer.slice(
          out.byteOffset,
          out.byteOffset + out.byteLength
        ) as ArrayBuffer;
        const mime =
          t === "pdf"
            ? "application/pdf"
            : t === "epub"
            ? "application/epub+zip"
            : "application/octet-stream";
        blob = new Blob([ab], { type: mime });
      } else if (typeof out === "string") {
        const type =
          t === "md"
            ? "text/markdown;charset=utf-8"
            : t === "txt"
            ? "text/plain;charset=utf-8"
            : "text/plain;charset=utf-8";
        blob = new Blob([out], { type });
      } else {
        blob = out;
      }
      const nameExt = t === "html" ? "html" : t;
      setOutUrl(URL.createObjectURL(blob));
      setOutName(swapExt(f.name, nameExt));
      setProgress(100);
      onConvert?.(1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  return (
    <section id="ebook" className="bg-transparent text-[#212121] scroll-mt-20">
      <div className={`${ubuntu.className} max-w-3xl px-5`}>
        <h2 className="text-2xl md:text-3xl font-bold">Convert eBooks</h2>
        <p className="mt-2 text-sm text-[#212121]/70">
          Pick a file(≤ 50 MB) and hit <b>Convert</b>.
        </p>

        <Card className="mt-6 border-[#212121]/10 bg-[#212121]/[0.04] p-5">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition",
              "border-[#212121]/15 bg-white"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={(ACCEPTED as readonly string[]).join(",")}
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
            />
            <div className="text-sm text-[#212121]/70">
              <div className="font-medium text-[#212121]">
                {file ? file.name : "Drag & drop your eBook here"}
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
              <div className="mt-2 text-xs">
                Supported: {ACCEPTED.join(", ")}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:flex-1 min-w-0">
              <Label className="mb-2 block">Target format</Label>
              <Select
                value={target}
                onValueChange={(v) => setTarget(v as TargetFmt)}
              >
                <SelectTrigger className="w-full bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 w-[--radix-select-trigger-width]">
                  {allowedTargets.map((fmt) => (
                    <SelectItem key={fmt} value={fmt}>
                      {fmt.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {file && !allowedTargets.includes(target) && (
                <p className="mt-2 text-xs text-[#212121]/60">
                  That output isn’t meaningful for this input.
                </p>
              )}
            </div>
            <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() =>
                  file &&
                  allowedTargets.includes(target) &&
                  convert(file, target)
                }
                disabled={
                  !file ||
                  !canConvert ||
                  converting ||
                  !allowedTargets.includes(target)
                }
                size="sm"
                className="w-full sm:w-auto sm:min-w-[6.5rem]"
              >
                {converting ? "Converting…" : "Convert"}
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  setError("");
                  setProgress(0);
                  clearOutput();
                }}
                size="sm"
                className="w-full sm:w-auto sm:min-w-[6.5rem] hover:bg-black/70 hover:text-white border border-[#212121]/10"
              >
                Reset
              </Button>
            </div>
          </div>

          {(progress > 0 || error) && (
            <div className="space-y-2">
              {progress > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs text-[#212121]/70">
                    <span>Converting...</span>
                    <span>{Math.min(progress, 100)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          )}

          {outUrl && !converting && (
            <div className="flex flex-col items-center gap-2">
              <Button
                asChild
                size="sm"
                title={`Download ${outName}`}
                className="inline-flex items-center gap-2 transition-shadow hover:shadow-lg"
              >
                <a href={outUrl} download={outName}>
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </Button>
              <p className="text-xs text-[#212121]/70">{outName}</p>
            </div>
          )}

          <p className="text-xs text-[#212121]/60">
            Note: In-browser only. DRM and complex page layouts aren’t
            supported. For PDFs we rasterize pages for EPUB; text exports are
            best-effort.
          </p>
        </Card>
      </div>
    </section>
  );
}
