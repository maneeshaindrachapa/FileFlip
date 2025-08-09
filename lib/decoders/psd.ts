import { readPsd, type Psd } from "ag-psd";

/**
 * Returns an HTMLImageElement rendered from a PSD.
 * Prefers the embedded composite canvas if present; otherwise flattens visible layers.
 */
export async function decodePSDFlat(file: File): Promise<HTMLImageElement> {
  const buf = await file.arrayBuffer();

  // Read layer and (if present) composite image data.
  const psd: Psd = readPsd(buf, {
    skipLayerImageData: false,
    skipCompositeImageData: false,
    skipThumbnail: true,
  });

  // 1) If PSD has an embedded composite canvas, use it (fast path).
  if (psd.canvas) {
    return canvasToImage(psd.canvas as HTMLCanvasElement);
  }

  // 2) Otherwise flatten layers (basic source-over; ignores advanced blend/masks).
  if (!psd.width || !psd.height) {
    throw new Error("Invalid PSD dimensions.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = psd.width;
  canvas.height = psd.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");

  const drawLayer = (layer: any) => {
    if (!layer || layer.hidden) return;
    // nested groups
    if (layer.children && Array.isArray(layer.children)) {
      layer.children.forEach(drawLayer);
      return;
    }
    if (layer.canvas) {
      const x = Math.round(layer.left ?? 0);
      const y = Math.round(layer.top ?? 0);
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(layer.canvas as HTMLCanvasElement, x, y);
    }
  };

  // Photoshop renders bottom→top; children array is bottom→top in ag-psd.
  if (Array.isArray(psd.children)) {
    psd.children.forEach(drawLayer);
  }

  return canvasToImage(canvas);
}

function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Could not export PSD canvas"));
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () =>
        reject(new Error("Failed to load rendered PSD image"));
      img.src = url;
    }, "image/png");
  });
}
