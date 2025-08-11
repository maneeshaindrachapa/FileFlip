// lib/decoders/ico.ts
export async function decodeICO(file: File): Promise<HTMLImageElement> {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  // ICONDIR
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error("Not a valid ICO file");
  }
  const count = view.getUint16(4, true);
  if (!count) throw new Error("Empty ICO");

  type Entry = { w: number; h: number; size: number; offset: number };
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const base = 6 + i * 16;
    const w = view.getUint8(base) || 256;
    const h = view.getUint8(base + 1) || 256;
    const size = view.getUint32(base + 8, true);
    const offset = view.getUint32(base + 12, true);
    entries.push({ w, h, size, offset });
  }
  // pick largest area
  entries.sort((a, b) => b.w * b.h - a.w * a.h);
  const best = entries[0];
  const slice = new Uint8Array(buf, best.offset, best.size);

  // PNG signature?
  const isPng =
    slice[0] === 0x89 &&
    slice[1] === 0x50 &&
    slice[2] === 0x4e &&
    slice[3] === 0x47 &&
    slice[4] === 0x0d &&
    slice[5] === 0x0a &&
    slice[6] === 0x1a &&
    slice[7] === 0x0a;

  if (isPng) {
    const blob = new Blob([slice], { type: "image/png" });
    return blobToImage(blob);
  }

  // BMP/DIB-based ICO not implemented in Phase 1
  throw new Error(
    "This ICO uses BMP entries which aren’t supported yet in Phase 1."
  );
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = (e) => rej(new Error("Failed to decode ICO image:" + e));
    img.src = url;
  });
}
