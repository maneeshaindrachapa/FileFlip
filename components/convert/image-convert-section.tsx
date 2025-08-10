"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import Dropzone from "./dropzone";
import { Label } from "../ui/label";
import { Download } from "lucide-react";
import JSZip from "jszip";
import { ubuntu } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import {
  OutMime,
  EXT,
  Meta,
  ResolutionMode,
  ImageSettings,
  simplifyRatio,
  decodeFile,
  rasterToSVGFromImage,
  encodePngQuantizedFromCanvas,
  CropRect,
  clamp,
  computeCenteredCropRect,
  refitCropToAspect,
  renderCropToCanvas,
} from "@/lib/image-utils";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

/* ---------------- Cropper --------------- */
function useImage(url?: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const im = new Image();
    im.decoding = "async";
    im.onload = () => setImg(im);
    im.src = url;
    return () => setImg(null);
  }, [url]);
  return img;
}

function CropCanvas({
  src,
  aspectW,
  aspectH,
  rect,
  setRect,
  previewHeight = 360,
}: {
  src: string;
  aspectW: number;
  aspectH: number;
  rect: CropRect | null;
  setRect: (r: CropRect) => void;
  previewHeight?: number;
}) {
  const img = useImage(src);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<null | {
    mode: "move" | "resize";
    corner?: "tl" | "tr" | "bl" | "br";
    startX: number;
    startY: number;
    startRect: CropRect;
  }>(null);

  const ar = Math.max(0.00001, aspectW / aspectH);

  const layout = useMemo(() => {
    if (!img) return null;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const ch = previewHeight;
    const cw = Math.round((iw / ih) * ch);
    const scale = ch / ih;
    return { iw, ih, cw, ch, scale };
  }, [img, previewHeight]);

  useEffect(() => {
    if (!img) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    if (!rect) {
      setRect(computeCenteredCropRect(iw, ih, aspectW, aspectH, 0.06));
      return;
    }
    setRect(refitCropToAspect(rect, iw, ih, aspectW, aspectH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, aspectW, aspectH]);

  // draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img || !layout || !rect) return;
    const { cw, ch, scale } = layout;
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // image
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);

    // outer dim
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, cw, ch);

    const rx = Math.round(rect.x * scale);
    const ry = Math.round(rect.y * scale);
    const rw = Math.round(rect.w * scale);
    const rh = Math.round(rect.h * scale);

    // punch-out
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();

    // subtle inner tint
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();

    // border
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

    // rule-of-thirds
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx + rw / 3, ry);
    ctx.lineTo(rx + rw / 3, ry + rh);
    ctx.moveTo(rx + (2 * rw) / 3, ry);
    ctx.lineTo(rx + (2 * rw) / 3, ry + rh);
    ctx.moveTo(rx, ry + rh / 3);
    ctx.lineTo(rx + rw, ry + rh / 3);
    ctx.moveTo(rx, ry + (2 * rh) / 3);
    ctx.lineTo(rx + rw, ry + (2 * rh) / 3);
    ctx.stroke();

    // handles
    const handle = 4;
    ctx.fillStyle = "#FFF";
    [
      [rx, ry],
      [rx + rw, ry],
      [rx, ry + rh],
      [rx + rw, ry + rh],
    ].forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, handle, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [img, layout, rect]);

  // interactions
  function hitTest(
    cx: number,
    cy: number
  ): null | "tl" | "tr" | "bl" | "br" | "body" {
    if (!rect || !layout) return null;
    const { scale } = layout;
    const rx = rect.x * scale;
    const ry = rect.y * scale;
    const rw = rect.w * scale;
    const rh = rect.h * scale;

    const corners: { id: "tl" | "tr" | "bl" | "br"; x: number; y: number }[] = [
      { id: "tl", x: rx, y: ry },
      { id: "tr", x: rx + rw, y: ry },
      { id: "bl", x: rx, y: ry + rh },
      { id: "br", x: rx + rw, y: ry + rh },
    ];
    for (const k of corners) {
      const dx = cx - k.x;
      const dy = cy - k.y;
      if (dx * dx + dy * dy <= 10 * 10) return k.id;
    }
    if (cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh) return "body";
    return null;
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!rect || !layout) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const bounds = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = e.clientX - bounds.left;
    const cy = e.clientY - bounds.top;
    const hit = hitTest(cx, cy);
    if (!hit) return;

    dragRef.current =
      hit === "body"
        ? { mode: "move", startX: cx, startY: cy, startRect: { ...rect } }
        : {
            mode: "resize",
            corner: hit,
            startX: cx,
            startY: cy,
            startRect: { ...rect },
          };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !rect || !img || !layout) return;
    const { iw, ih, scale } = layout;
    const bounds = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = e.clientX - bounds.left;
    const cy = e.clientY - bounds.top;

    const dx = (cx - dragRef.current.startX) / scale;
    const dy = (cy - dragRef.current.startY) / scale;

    if (dragRef.current.mode === "move") {
      const next = {
        x: clamp(Math.round(dragRef.current.startRect.x + dx), 0, iw - rect.w),
        y: clamp(Math.round(dragRef.current.startRect.y + dy), 0, ih - rect.h),
        w: rect.w,
        h: rect.h,
      };
      setRect(next);
      return;
    }

    // resize with AR lock
    const corner = dragRef.current.corner!;
    const signX = corner === "tr" || corner === "br" ? 1 : -1;
    const signY = corner === "bl" || corner === "br" ? 1 : -1;

    let w = dragRef.current.startRect.w + signX * dx;
    w = Math.max(16, w);
    let h = Math.max(16, w / ar);

    const tryH = dragRef.current.startRect.h + signY * dy;
    if (tryH > 16 && Math.abs(tryH - h) < Math.abs(h - tryH)) {
      h = tryH;
      w = h * ar;
    }

    let x = dragRef.current.startRect.x;
    let y = dragRef.current.startRect.y;
    if (corner === "tl") {
      x = dragRef.current.startRect.x + (dragRef.current.startRect.w - w);
      y = dragRef.current.startRect.y + (dragRef.current.startRect.h - h);
    } else if (corner === "tr") {
      y = dragRef.current.startRect.y + (dragRef.current.startRect.h - h);
    } else if (corner === "bl") {
      x = dragRef.current.startRect.x + (dragRef.current.startRect.w - w);
    }

    x = clamp(Math.round(x), 0, iw - Math.round(w));
    y = clamp(Math.round(y), 0, ih - Math.round(h));
    w = Math.min(Math.round(w), iw - x);
    h = Math.min(Math.round(h), ih - y);

    setRect({ x, y, w, h });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  return (
    <div className="w-full">
      <div className="relative w-full overflow-auto rounded-md border border-[#212121]/10 bg-white/40">
        {layout && (
          <div className="p-2">
            <canvas
              ref={canvasRef}
              width={layout.cw}
              height={layout.ch}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="block max-w-full cursor-crosshair"
              style={{ touchAction: "none" }}
            />
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-[#212121]/70">
        Drag to move. Resize from corners. Aspect ratio locked to{" "}
        <strong>
          {aspectW}:{aspectH}
        </strong>
        .
      </p>
    </div>
  );
}

/* ---------------- Main component (unchanged behavior) --------------- */

export default function ImageConvertSection() {
  // files & meta
  const [files, setFiles] = useState<File[]>([]);
  const [imageMeta, setImageMeta] = useState<Meta[]>([]);
  const [selected, setSelected] = useState<number>(-1);

  // settings (width/height removed)
  const [settings, setSettings] = useState<ImageSettings[]>([]);
  const [applyAll, setApplyAll] = useState(false);
  const [activePreset, setActivePreset] = useState<{
    rw: number;
    rh: number;
  } | null>(null);
  const [smallPng, setSmallPng] = useState(false);

  // per-image crop rectangles
  const [crops, setCrops] = useState<(CropRect | null)[]>([]);

  // output
  const [outMime, setOutMime] = useState<OutMime>("image/png");
  const [quality, setQuality] = useState(92);
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

    Promise.all(
      picked.map(
        (file) =>
          new Promise<Meta>((res) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
              const width = img.naturalWidth || img.width;
              const height = img.naturalHeight || img.height;
              res({
                name: file.name,
                width,
                height,
                sizeKB: +(file.size / 1024).toFixed(1),
                preview: url,
              });
            };
            img.src = url;
          })
      )
    ).then((meta) => {
      setImageMeta(meta);
      const init = meta.map((m) => {
        const { rw, rh } = simplifyRatio(m.width, m.height);
        return {
          mode: "original",
          ratioW: rw,
          ratioH: rh,
        } as ImageSettings;
      });
      setSettings(init);
      setCrops(meta.map(() => null));
      setSelected(meta.length ? 0 : -1);
    });
  }, []);

  const selectedMeta = selected >= 0 ? imageMeta[selected] : null;
  const selectedSettings = selected >= 0 ? settings[selected] : null;

  const patchSelected = <K extends keyof ImageSettings>(
    key: K,
    value: ImageSettings[K]
  ) => {
    if (selected < 0) return;
    setSettings((prev) => {
      const next = [...prev];
      next[selected] = { ...(next[selected] || {}), [key]: value };
      if (applyAll && imageMeta.length > 1) {
        for (let i = 0; i < next.length; i++) {
          next[i] = { ...(next[i] || {}), [key]: value };
        }
      }
      return next;
    });
  };
  const setMode = (mode: ResolutionMode) => patchSelected("mode", mode);

  const setRatioBoth = (rw: number, rh: number) => {
    if (rw <= 0 || rh <= 0) return;
    const simp = simplifyRatio(Math.round(rw), Math.round(rh));
    patchSelected("ratioW", simp.rw);
    patchSelected("ratioH", simp.rh);
  };

  const handlePresetClick = (rw: number, rh: number) => {
    setRatioBoth(rw, rh);
    setActivePreset({ rw, rh });
  };

  const changeOutput = (mime: OutMime) => {
    setOutMime(mime);
    setProgress(0);
    setZipProgress(0);
  };

  const convertAll = useCallback(async () => {
    if (!files.length || !imageMeta.length || !settings.length) return;
    setBusy(true);
    setError("");
    setProgress(0);

    const out: { name: string; url: string; blob: Blob }[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const img = await decodeFile(f);
        const s = settings[i];
        const crop = crops[i];

        const canvas =
          s.mode === "custom"
            ? await renderCropToCanvas(img, crop)
            : await renderCropToCanvas(img, crop ?? null);

        let blob: Blob;
        if (outMime === "image/svg+xml") {
          const dataURL = canvas.toDataURL("image/png");
          const tempImg = await new Promise<HTMLImageElement>(
            (resolve, reject) => {
              const im = new Image();
              im.onload = () => resolve(im);
              im.onerror = reject;
              im.src = dataURL;
            }
          );
          blob = await rasterToSVGFromImage(
            tempImg,
            canvas.width,
            canvas.height
          );
        } else if (outMime === "image/png" && smallPng) {
          blob = await encodePngQuantizedFromCanvas(canvas, 128);
        } else {
          blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob(
              (b) => (b ? res(b) : rej(new Error("Failed to encode"))),
              outMime as Exclude<OutMime, "image/svg+xml">,
              outMime === "image/png"
                ? undefined
                : Math.min(1, Math.max(0.01, quality / 100))
            )
          );
        }

        const base = f.name.replace(/\.[^.]+$/, "");
        out.push({
          name: `${base}.${EXT[outMime]}`,
          url: URL.createObjectURL(blob),
          blob,
        });

        setProgress(Math.round(((i + 1) / files.length) * 100));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      setResults(out);
    } catch (e: any) {
      setError(e?.message || "Conversion failed");
    } finally {
      setBusy(false);
    }
  }, [files, imageMeta, settings, outMime, quality, crops, smallPng]);

  const downloadAllAsZip = async () => {
    if (!results.length) return;
    setZipping(true);
    setZipProgress(0);
    const zip = new JSZip();
    results.forEach((r) => zip.file(r.name, r.blob));
    const blob = await zip.generateAsync({ type: "blob" }, (meta) =>
      setZipProgress(Math.round(meta.percent))
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted_images.zip";
    a.click();
    URL.revokeObjectURL(url);
    setZipping(false);
  };

  const supportedNote = useMemo(() => {
    if (outMime === "image/avif")
      return "AVIF depends on your browser; we'll fallback automatically.";
    if (outMime === "image/svg+xml")
      return "SVG output uses in-browser vectorization (approximate).";
    return "";
  }, [outMime]);

  return (
    <section className={`${ubuntu.className} bg-transparent text-[#212121]`}>
      <div className="mx-auto max-w-6xl px-5 pb-12 pt-4">
        <h2 className="text-2xl md:text-3xl font-bold">Convert Images</h2>
        <p className="mt-2 text-[#212121]/70">{acceptText}</p>

        <Card className="mt-6 border-[#212121]/10 bg-[#212121]/[0.05] p-5">
          <Dropzone onFiles={onPicked} />

          {!!imageMeta.length && (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {imageMeta.map((m, idx) => {
                const { rw, rh } = simplifyRatio(m.width, m.height);
                const isSel = idx === selected;
                return (
                  <button
                    key={m.name + idx}
                    onClick={() => setSelected(idx)}
                    className={cn(
                      "text-left rounded-lg overflow-hidden border transition focus:outline-none focus:ring-2",
                      isSel
                        ? "border-blue-500 ring-blue-300"
                        : "border-[#212121]/10 hover:border-[#212121]/30"
                    )}
                  >
                    <img
                      src={m.preview}
                      alt={m.name}
                      className="w-full h-28 object-cover"
                    />
                    <div className="p-2">
                      <p className="truncate text-xs font-medium">{m.name}</p>
                      <p className="text-[11px] text-[#212121]/70">
                        {m.width}×{m.height}px — {m.sizeKB} KB
                      </p>
                      <p className="text-[11px] text-[#212121]/80">
                        AR: {rw}:{rh}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedMeta && selectedSettings && (
            <div className="mt-6 grid gap-5">
              {/* Header row */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-[#212121]/80">
                  Editing:{" "}
                  <span className="font-medium">{selectedMeta.name}</span> •
                  Original: {selectedMeta.width}×{selectedMeta.height}px • AR{" "}
                  {simplifyRatio(selectedMeta.width, selectedMeta.height).rw}:
                  {simplifyRatio(selectedMeta.width, selectedMeta.height).rh}
                </div>

                {imageMeta.length > 1 && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={applyAll}
                      onChange={(e) => setApplyAll(e.target.checked)}
                    />
                    Apply to all images
                  </label>
                )}
              </div>

              {/* Resolution mode */}
              <div className="grid grid-cols-1 gap-3 max-w-lg">
                <RadioGroup
                  value={selectedSettings.mode}
                  onValueChange={(value) => setMode(value as ResolutionMode)}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="original" id="r-original" />
                    <Label
                      htmlFor="r-original"
                      className={cn(
                        "text-sm",
                        selectedSettings.mode === "original"
                          ? "text-black"
                          : "text-[#212121]/80"
                      )}
                    >
                      Original resolution
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="r-custom" />
                    <Label
                      htmlFor="r-custom"
                      className={cn(
                        "text-sm",
                        selectedSettings.mode === "custom"
                          ? "text-black"
                          : "text-[#212121]/80"
                      )}
                    >
                      Custom (crop to aspect)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Custom mode: canvas + settings split */}
              {selectedSettings.mode === "custom" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Crop canvas (half page on desktop, full on mobile) */}
                  <div className="md:sticky md:top-4">
                    <CropCanvas
                      src={selectedMeta.preview}
                      aspectW={selectedSettings.ratioW}
                      aspectH={selectedSettings.ratioH}
                      rect={crops[selected]}
                      setRect={(r) =>
                        setCrops((prev) => {
                          const next = [...prev];
                          next[selected] = r;
                          if (applyAll)
                            for (let i = 0; i < next.length; i++) next[i] = r;
                          return next;
                        })
                      }
                      previewHeight={420} // a touch taller for desktop; still responsive
                    />
                  </div>

                  {/* Right: Controls (other half) */}
                  <div className="space-y-4">
                    {/* Ratio controls */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <Label className="mb-1 block">Ratio W</Label>
                        <Input
                          type="number"
                          min={1}
                          value={selectedSettings.ratioW}
                          onChange={(e) =>
                            setRatioBoth(
                              Number(e.target.value || 1),
                              selectedSettings.ratioH
                            )
                          }
                          className="w-full bg-white/[0.06] border-[#212121]/10 text-[#212121] rounded-md px-2 py-1.5"
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block">Ratio H</Label>
                        <Input
                          type="number"
                          min={1}
                          value={selectedSettings.ratioH}
                          onChange={(e) =>
                            setRatioBoth(
                              selectedSettings.ratioW,
                              Number(e.target.value || 1)
                            )
                          }
                          className="w-full bg-white/[0.06] border-[#212121]/10 text-[#212121] rounded-md px-2 py-1.5"
                        />
                      </div>
                    </div>

                    {/* Presets */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Preset
                        onClick={() => handlePresetClick(1, 1)}
                        selected={
                          activePreset?.rw === 1 && activePreset?.rh === 1
                        }
                      >
                        1:1
                      </Preset>
                      <Preset
                        onClick={() => handlePresetClick(4, 3)}
                        selected={
                          activePreset?.rw === 4 && activePreset?.rh === 3
                        }
                      >
                        4:3
                      </Preset>
                      <Preset
                        onClick={() => handlePresetClick(16, 9)}
                        selected={
                          activePreset?.rw === 16 && activePreset?.rh === 9
                        }
                      >
                        16:9
                      </Preset>
                      <Preset
                        onClick={() => handlePresetClick(9, 16)}
                        selected={
                          activePreset?.rw === 9 && activePreset?.rh === 16
                        }
                      >
                        9:16
                      </Preset>
                    </div>

                    <p className="text-[11px] text-[#212121]/70">
                      Drag inside the crop to move • Resize from corners •
                      Photoshop-style dim overlay outside the crop for focus.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Output + quality + actions */}
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label className={`${ubuntu.className} text-sm`}>
                Output format
              </Label>
              <Select
                value={outMime}
                onValueChange={(v) => changeOutput(v as OutMime)}
              >
                <SelectTrigger
                  className={`${ubuntu.className} w-full bg-[#212121]/[0.06] border-[#212121]/10 text-[#212121]`}
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
                  <SelectItem value="image/svg+xml">SVG (vectorize)</SelectItem>
                </SelectContent>
              </Select>
              {outMime === "image/png" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={smallPng}
                    onChange={(e) => setSmallPng(e.target.checked)}
                  />
                  Smaller PNG (palette quantization)
                </label>
              )}
              {outMime !== "image/png" && outMime !== "image/svg+xml" && (
                <div className="mt-3">
                  <Label className="pb-3">Quality ({quality}%)</Label>
                  <Slider
                    min={1}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={(val) => setQuality(val[0])}
                    className="[&_[data-slot=slider-track]]:bg-[#212121]/30 [&_[data-slot=slider-range]]:bg-[#212121]"
                  />
                </div>
              )}
              {supportedNote && (
                <p className="text-xs text-[#212121]/60 mt-1">
                  {supportedNote}
                </p>
              )}
            </div>

            <div
              className={`${ubuntu.className} flex flex-col-reverse sm:flex-row items-stretch sm:items-end sm:justify-end gap-3`}
            >
              <Button
                disabled={!files.length || busy}
                onClick={convertAll}
                className="w-full sm:w-auto"
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
                >
                  {zipping ? "Zipping…" : "Download All"}
                </Button>
              )}
            </div>
          </div>

          {(busy || progress > 0) && (
            <div className="mt-4">
              <div
                className={`${ubuntu.className} mb-1 text-xs text-[#212121]/70`}
              >
                Conversion progress {progress}%
              </div>
              <Progress
                value={progress}
                className="h-2 transition-[width] duration-300"
              />
            </div>
          )}
          {zipping && (
            <div className="mt-3">
              <div
                className={`${ubuntu.className} mb-1 text-xs text-[#212121]/70`}
              >
                Preparing ZIP {zipProgress}%
              </div>
              <Progress
                value={zipProgress}
                className="h-2 transition-[width] duration-300"
              />
            </div>
          )}

          {!!results.length && (
            <div className={`${ubuntu.className} mt-6`}>
              <p className="mb-3 text-sm text-[#212121]/80">Downloads:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {results.map((r) => (
                  <a
                    key={r.name}
                    download={r.name}
                    href={r.url}
                    className="flex items-center justify-between rounded-lg border border-[#212121]/10 bg-[#212121]/[0.06] px-3 py-2 text-sm hover:bg-[#212121]/10 transition"
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

        <p className={`${ubuntu.className} mt-3 text-xs text-[#212121]/50`}>
          *Animated GIFs export the first frame. All processing happens locally
          in your browser.
        </p>
      </div>
    </section>
  );
}

function Preset({
  onClick,
  children,
  selected,
}: {
  onClick: () => void;
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-xs px-2.5 py-1.5 rounded-md border border-[#212121]/15 transition",
        selected
          ? "bg-[#212121] text-white border-[#212121]/20"
          : "bg-white/5 hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}
