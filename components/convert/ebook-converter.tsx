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
  pdfToPlainText,
  pdfToEpubWithPageImages,
  parseEpub,
  epubToSingleHtml,
  htmlArrayToMarkdown,
  textToRtf,
  textToMinimalDocx,
  epubToPdfWithImages,
} from "@/lib/ebook-utils";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB limit
const ACCEPTED = [".epub", ".pdf"] as const;
type TargetFmt = "pdf" | "txt" | "epub" | "html" | "md" | "rtf" | "docx";

type Props = {
  onConvert?: (size: number) => void;
};

export default function EbookConverter({ onConvert }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<TargetFmt>("pdf");
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [converting, setConverting] = useState(false);

  // Output state (for download button)
  const [outUrl, setOutUrl] = useState<string>("");
  const [outName, setOutName] = useState<string>("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const canConvert = useMemo(() => !!file && file.size <= MAX_BYTES, [file]);

  const sourceExt = useMemo(() => {
    if (!file) return "";
    const i = file.name.lastIndexOf(".");
    return i >= 0 ? file.name.slice(i).toLowerCase() : "";
  }, [file]);

  const allowedTargets: TargetFmt[] = useMemo(() => {
    if (sourceExt === ".pdf") return ["epub", "txt"]; // pdf -> epub (images), txt
    if (sourceExt === ".epub")
      return ["pdf", "txt", "html", "md", "rtf", "docx"];
    return ["pdf", "txt", "epub", "html", "md", "rtf", "docx"];
  }, [sourceExt]);

  const onPick = () => inputRef.current?.click();

  // Revoke previous object URL whenever we replace it or unmount
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

      if (!(ACCEPTED as readonly string[]).includes(ext)) {
        setError(
          `Unsupported file type: ${ext || "(none)"} . Only EPUB or PDF.`
        );
        return;
      }
      if (f.size > MAX_BYTES) {
        setError("File is larger than 50 MB. Please upload a smaller file.");
        return;
      }
      // Default target based on input (user can change)
      setTarget(ext === ".pdf" ? "epub" : "pdf");
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
      const buf = await f.arrayBuffer();
      setProgress(15);

      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();

      if (ext === ".epub") {
        setProgress(25);
        const { text, html, images } = await parseEpub(buf, (p: number) =>
          setProgress(25 + Math.round(p * 40))
        );

        if (!text.trim())
          throw new Error("Could not extract text from EPUB chapters.");

        if (t === "txt") {
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          setOutUrl(URL.createObjectURL(blob));
          setOutName(swapExt(f.name, "txt"));
        } else if (t === "html") {
          const blob = await epubToSingleHtml(html, images);
          setOutUrl(URL.createObjectURL(blob));
          setOutName(swapExt(f.name, "html"));
        } else if (t === "md") {
          const md = htmlArrayToMarkdown(html, images);
          const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
          setOutUrl(URL.createObjectURL(blob));
          setOutName(swapExt(f.name, "md"));
        } else if (t === "rtf") {
          const rtf = textToRtf(text); // text-only RTF
          const blob = new Blob([rtf], { type: "application/rtf" });
          setOutUrl(URL.createObjectURL(blob));
          setOutName(swapExt(f.name, "rtf"));
        } else if (t === "docx") {
          const blob = await textToMinimalDocx(text); // BASIC docx (no images)
          setOutUrl(URL.createObjectURL(blob));
          setOutName(swapExt(f.name, "docx"));
        } else if (t === "pdf") {
          setProgress(70);
          const pdfBytes = await epubToPdfWithImages(
            html,
            images,
            (p: number) => setProgress(70 + Math.round(p * 25))
          );
          const ab = new ArrayBuffer(pdfBytes.byteLength);
          new Uint8Array(ab).set(pdfBytes);
          const blob = new Blob([ab], { type: "application/pdf" });
          setOutUrl(URL.createObjectURL(blob));
          setOutName(swapExt(f.name, "pdf"));
        } else {
          throw new Error("EPUB → EPUB conversion is not meaningful here.");
        }
        setProgress(100);
        onConvert?.(1);
      } else if (ext === ".pdf") {
        if (t === "txt") {
          setProgress(30);
          const text = await pdfToPlainText(buf);
          if (!text.trim()) throw new Error("Could not extract text from PDF.");
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          setOutUrl(URL.createObjectURL(blob));
          setOutName(swapExt(f.name, "txt"));
          setProgress(100);
          onConvert?.(1);
        } else if (t === "epub") {
          // PDF -> EPUB with page images (bitmap pages)
          const epubBlob = await pdfToEpubWithPageImages(buf, {
            title: f.name.replace(/\.[^.]+$/, ""),
            author: "Unknown",
            onProgress: (p: number) => setProgress(10 + Math.round(p * 80)), // 10→90
          });
          setOutUrl(URL.createObjectURL(epubBlob));
          setOutName(swapExt(f.name, "epub"));
          setProgress(100);
          onConvert?.(1);
        } else {
          throw new Error(
            "PDF → this format is not available (choose EPUB or TXT)."
          );
        }
      } else {
        throw new Error("Unsupported input type.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setConverting(false);
      // keep progress visible until user downloads/resets; don't auto-reset
    }
  };

  return (
    <section id="ebook" className="bg-transparent text-[#212121] scroll-mt-20">
      <div className={`${ubuntu.className} max-w-3xl px-5`}>
        <h2 className="text-2xl md:text-3xl font-bold">Convert eBooks</h2>
        <p className="mt-2 text-sm text-[#212121]/70">
          Upload an EPUB or PDF (≤ 50 MB). Click <b>Convert</b>, then download
          the result.
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
                {file ? file.name : "Drag & drop your EPUB or PDF here"}
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
                Supported: EPUB, PDF • Max size: 50 MB
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
                  {sourceExt === ".pdf"
                    ? "For PDF input, choose EPUB or TXT."
                    : "For EPUB input, choose PDF or TXT."}
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

          <div className="mt-5 flex flex-col gap-3">
            {progress > 0 && (
              <>
                <div className="flex items-center justify-between text-xs text-[#212121]/70">
                  <span>Converting…</span>
                  <span>{Math.min(progress, 100)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          {outUrl && !converting && (
            <div className="mt-6 flex flex-col items-center gap-2">
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

          <p className="mt-4 text-xs text-[#212121]/60">
            Note: Output is text-focused. Complex layouts/images/DRM aren’t
            supported in-browser.
          </p>
        </Card>
      </div>
    </section>
  );
}
