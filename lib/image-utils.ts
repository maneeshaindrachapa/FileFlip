import UPNG from "upng-js";

/* ---------------- decoding registry ---------------- */
export type RasterDecoder = (f: File) => Promise<HTMLImageElement>;

export const registry: Record<string, () => Promise<RasterDecoder>> = {
  jpg: async () => nativeDecoder,
  jpeg: async () => nativeDecoder,
  png: async () => nativeDecoder,
  webp: async () => nativeDecoder,
  avif: async () => nativeDecoder,
  gif: async () => nativeDecoder,
  bmp: async () => nativeDecoder,
  svg: async () => nativeDecoder, // pass-through for preview
  ico: async () => (await import("@/lib/decoders/ico")).decodeICO,
  ppm: async () => (await import("@/lib/decoders/ppm")).decodePPM,
};

export async function nativeDecoder(file: File): Promise<HTMLImageElement> {
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

export async function decodeFile(file: File): Promise<HTMLImageElement> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const loader = registry[ext];
  if (!loader) throw new Error(`Unsupported format: .${ext}`);
  const decoder = await loader();
  return decoder(file);
}

/* ---------------- math helpers ---------------- */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function simplifyRatio(w: number, h: number) {
  const g = gcd(w, h);
  return {
    rw: Math.max(1, Math.round(w / g)),
    rh: Math.max(1, Math.round(h / g)),
  };
}

/* ---------------- types ---------------- */
export type ResolutionMode = "original" | "custom";
export type ImageSettings = {
  mode: ResolutionMode;
  ratioW: number;
  ratioH: number;
  width?: number;
  height?: number;
};

export type Meta = {
  name: string;
  width: number;
  height: number;
  sizeKB: number;
  preview: string;
};

/* ---------------- target sizing ---------------- */
export function computeTargetSize(meta: Meta, s: ImageSettings) {
  if (s.mode === "original") return { w: meta.width, h: meta.height };

  const rw = Math.max(1, s.ratioW || 1);
  const rh = Math.max(1, s.ratioH || 1);

  // both provided → trust them
  if (s.width && s.height) {
    return { w: Math.round(s.width), h: Math.round(s.height) };
  }

  // width provided → calc height from ratio
  if (s.width && !s.height) {
    const w = Math.round(s.width);
    const h = Math.max(1, Math.round((w * rh) / rw));
    return { w, h };
  }

  // height provided → calc width from ratio
  if (!s.width && s.height) {
    const h = Math.round(s.height);
    const w = Math.max(1, Math.round((h * rw) / rh));
    return { w, h };
  }

  // none provided → start from original width
  const w = meta.width;
  const h = Math.max(1, Math.round((w * rh) / rw));
  return { w, h };
}

/* ---------------- raster encoders ---------------- */
export type OutMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/avif"
  | "image/svg+xml";

export const EXT: Record<OutMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export async function encodeRaster(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  desired: Exclude<OutMime, "image/svg+xml">,
  qualityPct = 92
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, targetW);
  canvas.height = Math.max(1, targetH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const q =
    desired === "image/png"
      ? undefined
      : Math.min(1, Math.max(0.01, qualityPct / 100));

  return new Promise((res, rej) => {
    canvas.toBlob(
      (blob) => (blob ? res(blob) : rej(new Error("Failed to encode"))),
      desired,
      q
    );
  });
}

/* ---------------- PNG quantization ---------------- */
export async function encodePngQuantizedFromCanvas(
  canvas: HTMLCanvasElement,
  colors = 128
): Promise<Blob> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  const { width, height } = canvas;
  const id = ctx.getImageData(0, 0, width, height);
  const rgba = id.data.buffer; // ArrayBuffer
  const png = UPNG.encode([rgba], width, height, colors);
  return new Blob([png], { type: "image/png" });
}

export function drawToCanvas(
  img: HTMLImageElement,
  w: number,
  h: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/* ---------------- SVG vectorization ---------------- */
export async function vectorizeImageDataToSVG(
  imageData: ImageData,
  options: Partial<import("@image-tracer-ts/core").Options> = {}
): Promise<string> {
  const { ImageTracer } = await import("@image-tracer-ts/core");
  const tracer = new ImageTracer(options);
  return tracer.traceImageToSvg(imageData);
}

export async function rasterToSVGFromImage(
  img: HTMLImageElement,
  targetW?: number,
  targetH?: number,
  options: Partial<import("@image-tracer-ts/core").Options> = {}
): Promise<Blob> {
  const w = targetW ?? img.naturalWidth;
  const h = targetH ?? img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const svgString = await vectorizeImageDataToSVG(imgData, options);
  return new Blob([svgString], { type: "image/svg+xml" });
}

/* ------------- CROP TYPES + HELPERS (no React) ------------ */
export type CropRect = { x: number; y: number; w: number; h: number };

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function fitARInto(boundsW: number, boundsH: number, ar: number) {
  let cw = boundsW;
  let ch = cw / ar;
  if (ch > boundsH) {
    ch = boundsH;
    cw = ch * ar;
  }
  return { cw, ch };
}

export function computeCenteredCropRect(
  iw: number,
  ih: number,
  aspectW: number,
  aspectH: number,
  pad = 0.06
): CropRect {
  const ar = Math.max(0.00001, aspectW / aspectH);
  const maxW = iw * (1 - pad * 2);
  const maxH = ih * (1 - pad * 2);
  const { cw, ch } = fitARInto(maxW, maxH, ar);
  const x = Math.round((iw - cw) / 2);
  const y = Math.round((ih - ch) / 2);
  return { x, y, w: Math.round(cw), h: Math.round(ch) };
}

export function refitCropToAspect(
  rect: CropRect,
  iw: number,
  ih: number,
  aspectW: number,
  aspectH: number
): CropRect {
  const ar = Math.max(0.00001, aspectW / aspectH);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  let h = Math.max(16, rect.h);
  let w = h * ar;

  if (w > iw) {
    w = iw;
    h = Math.max(16, w / ar);
  }
  if (h > ih) {
    h = ih;
    w = Math.max(16, h * ar);
  }

  let x = Math.round(cx - w / 2);
  let y = Math.round(cy - h / 2);

  x = clamp(x, 0, iw - Math.round(w));
  y = clamp(y, 0, ih - Math.round(h));
  w = Math.min(Math.round(w), iw - x);
  h = Math.min(Math.round(h), ih - y);

  return { x, y, w, h };
}

export async function renderCropToCanvas(
  img: HTMLImageElement,
  crop: CropRect | null
): Promise<HTMLCanvasElement> {
  const w = crop ? Math.max(1, Math.round(crop.w)) : img.naturalWidth;
  const h = crop ? Math.max(1, Math.round(crop.h)) : img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (crop) {
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  } else {
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, w, h);
  }

  return canvas;
}
