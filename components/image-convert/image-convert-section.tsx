"use client";

import { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import Dropzone from "../convert/dropzone";
import { Label } from "../ui/label";
import { Download } from "lucide-react";
import JSZip from "jszip";
import { ubuntu } from "@/lib/fonts";

type OutMime = "image/png" | "image/jpeg" | "image/webp" | "image/avif";

const EXT: Record<OutMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

const registry: Record<
  string,
  () => Promise<(f: File) => Promise<HTMLImageElement>>
> = {
  jpg: async () => nativeDecoder,
  jpeg: async () => nativeDecoder,
  png: async () => nativeDecoder,
  webp: async () => nativeDecoder,
  avif: async () => nativeDecoder,
  gif: async () => nativeDecoder,
  bmp: async () => nativeDecoder,
  svg: async () => nativeDecoder,
  ico: async () => (await import("@/lib/decoders/ico")).decodeICO,
  psd: async () => (await import("@/lib/decoders/psd")).decodePSDFlat,
  ppm: async () => (await import("@/lib/decoders/ppm")).decodePPM,
};

async function nativeDecoder(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function decodeFile(file: File): Promise<HTMLImageElement> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const loader = registry[ext];
  if (!loader) throw new Error(`Unsupported format: .${ext}`);
  const decoder = await loader();
  return decoder(file);
}

function qualityFor(type: OutMime) {
  return type === "image/png" ? undefined : 0.92;
}

async function encodeImage(
  img: HTMLImageElement,
  desired: OutMime
): Promise<Blob> {
  const w = img.naturalWidth,
    h = img.naturalHeight;
  const tryOrder: OutMime[] = [
    desired,
    "image/webp",
    "image/png",
    "image/jpeg",
  ];
  const Off = (globalThis as any).OffscreenCanvas;

  if (Off) {
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    ctx.drawImage(img, 0, 0, w, h);
    for (const mime of tryOrder) {
      try {
        const blob = await off.convertToBlob({
          type: mime,
          quality: qualityFor(mime),
        });
        if (blob && blob.size) return blob;
      } catch {}
    }
    throw new Error("Encoding not supported");
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.drawImage(img, 0, 0, w, h);
  for (const mime of tryOrder) {
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, mime, qualityFor(mime))
    );
    if (blob) return blob;
  }
  throw new Error("Encoding not supported");
}

export default function ImageConvertSection() {
  const [files, setFiles] = useState<File[]>([]);
  const [outMime, setOutMime] = useState<OutMime>("image/png");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    { name: string; url: string; blob: Blob }[]
  >([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [zipping, setZipping] = useState(false);

  const acceptText =
    "JPG, PNG, WebP, GIF*, AVIF, BMP, SVG, ICO, PSD, PPM — all in-browser (Max 10MB each)";

  const onPicked = useCallback((picked: File[]) => {
    setError("");
    setResults((r) => {
      r.forEach((x) => URL.revokeObjectURL(x.url));
      return [];
    });
    setProgress(0);
    setZipProgress(0);
    setZipping(false);
    setFiles(picked);
  }, []);

  const convertAll = useCallback(async () => {
    if (!files.length) return;
    setBusy(true);
    setError("");
    setProgress(0);

    const out: { name: string; url: string; blob: Blob }[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const img = await decodeFile(f);
        const blob = await encodeImage(img, outMime);
        const base = f.name.replace(/\.[^.]+$/, "");
        out.push({
          name: `${base}.${EXT[outMime]}`,
          url: URL.createObjectURL(blob),
          blob,
        });
        // animate progress per file
        const pct = Math.round(((i + 1) / files.length) * 100);
        setProgress(pct);
        // allow UI to paint
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      setResults(out);
    } catch (e: any) {
      setError(e?.message || "Conversion failed");
    } finally {
      setBusy(false);
    }
  }, [files, outMime]);

  const downloadAllAsZip = async () => {
    if (!results.length) return;
    setZipping(true);
    setZipProgress(0);
    const zip = new JSZip();
    results.forEach((r) => zip.file(r.name, r.blob));
    const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
      setZipProgress(Math.round(meta.percent));
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted_images.zip";
    a.click();
    URL.revokeObjectURL(url);
    setZipping(false);
  };

  const supportedNote = useMemo(
    () =>
      outMime === "image/avif"
        ? "AVIF depends on your browser; we'll fallback automatically."
        : "",
    [outMime]
  );

  return (
    <section className="bg-black text-white">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <h2 className={`${ubuntu.className} text-2xl md:text-3xl font-bold`}>
          Convert Images
        </h2>
        <p className={`${ubuntu.className} mt-2 text-white/70`}>{acceptText}</p>

        <Card className="mt-6 border-white/10 bg-white/[0.05] p-5">
          <Dropzone onFiles={onPicked} />

          {/* Convert controls */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label className={`${ubuntu.className} text-sm`}>
                Output format
              </Label>
              <Select
                value={outMime}
                onValueChange={(v) => setOutMime(v as OutMime)}
              >
                <SelectTrigger
                  className={`${ubuntu.className} w-full bg-white/[0.06] border-white/10 text-white`}
                >
                  <SelectValue placeholder="Choose format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image/png">
                    PNG (lossless, transparency)
                  </SelectItem>
                  <SelectItem value="image/jpeg">JPG (photos)</SelectItem>
                  <SelectItem value="image/webp">
                    WebP (modern, small)
                  </SelectItem>
                  <SelectItem value="image/avif">
                    AVIF (smallest, experimental)
                  </SelectItem>
                </SelectContent>
              </Select>
              {supportedNote && (
                <p className="text-xs text-white/60">{supportedNote}</p>
              )}
            </div>

            <div
              className={`${ubuntu.className} flex flex-col-reverse sm:flex-row items-stretch sm:items-end sm:justify-end gap-3`}
            >
              {/* Convert first on mobile */}
              <Button
                disabled={!files.length || busy}
                onClick={convertAll}
                className="w-full sm:w-auto"
                aria-label="Convert files"
              >
                {busy
                  ? "Converting…"
                  : `Convert ${files.length || ""} file${
                      files.length === 1 ? "" : "s"
                    }`}
              </Button>

              {results.length > 1 && (
                <Button
                  onClick={downloadAllAsZip}
                  variant="secondary"
                  disabled={zipping}
                  className="w-full sm:w-auto"
                  aria-label="Download all as ZIP"
                >
                  {zipping ? "Zipping…" : "Download All"}
                </Button>
              )}
            </div>
          </div>

          {/* Animated conversion progress */}
          {(busy || progress > 0) && (
            <div className="mt-4">
              <div className={`${ubuntu.className} mb-1 text-xs text-white/70`}>
                Conversion progress {progress}%
              </div>
              <Progress
                value={progress}
                className="h-2 transition-[width] duration-300"
              />
            </div>
          )}

          {/* Animated zip progress */}
          {zipping && (
            <div className="mt-3">
              <div className={`${ubuntu.className} mb-1 text-xs text-white/70`}>
                Preparing ZIP {zipProgress}%
              </div>
              <Progress
                value={zipProgress}
                className="h-2 transition-[width] duration-300"
              />
            </div>
          )}

          {/* Selected files */}
          {!!files.length && (
            <div className={`${ubuntu.className} mt-5 text-sm text-white/80`}>
              <p className="mb-1">Selected:</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pl-5 space-y-1">
                {files.map((f) => (
                  <li key={f.name}>
                    {f.name} - {(f.size / 1024).toFixed(0)} KB
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Results */}
          {!!results.length && (
            <div className={`${ubuntu.className} mt-6`}>
              <p className="mb-3 text-sm text-white/80">Downloads:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {results.map((r) => (
                  <a
                    key={r.name}
                    download={r.name}
                    href={r.url}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/10 transition"
                  >
                    <span>{r.name}</span>
                    <Download className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </Card>

        <p className={`${ubuntu.className} mt-3 text-xs text-white/50`}>
          *Animated GIFs export the first frame. All processing happens locally
          in your browser.
        </p>
      </div>
    </section>
  );
}
