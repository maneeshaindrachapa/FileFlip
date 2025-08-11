import { readPsd, type Psd } from "ag-psd";

type LayerNode = {
  hidden?: boolean;
  children?: LayerNode[];
  canvas?: HTMLCanvasElement | OffscreenCanvas | null;
  left?: number;
  top?: number;
  opacity?: number;
};

export async function decodePSDFlat(file: File): Promise<HTMLImageElement> {
  const buf = await file.arrayBuffer();

  // Read layer and (if present) composite image data.
  const psd: Psd = readPsd(buf, {
    skipLayerImageData: false,
    skipCompositeImageData: false,
    skipThumbnail: true,
  });

  // 1) If PSD has an embedded composite canvas, use it (fast path).
  if ((psd as unknown as { canvas?: HTMLCanvasElement }).canvas) {
    return canvasToImage(
      (psd as unknown as { canvas: HTMLCanvasElement }).canvas
    );
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

  const normalizeAlpha = (op?: number) =>
    typeof op === "number" ? (op > 1 ? op / 255 : op) : 1;

  const drawLayer = (layer?: LayerNode | null): void => {
    if (!layer || layer.hidden) return;

    // nested groups
    if (Array.isArray(layer.children) && layer.children.length) {
      layer.children.forEach(drawLayer);
      return;
    }

    if (layer.canvas) {
      const x = Math.round(layer.left ?? 0);
      const y = Math.round(layer.top ?? 0);
      ctx.globalAlpha = normalizeAlpha(layer.opacity);
      ctx.globalCompositeOperation = "source-over";
      // OffscreenCanvas needs conversion to a bitmap for drawImage in some browsers;
      // but HTMLCanvasElement works directly. Cast safely:
      const src =
        layer.canvas instanceof HTMLCanvasElement
          ? layer.canvas
          : (layer.canvas as unknown as HTMLCanvasElement);
      ctx.drawImage(src, x, y);
    }
  };

  // Photoshop renders bottom→top; children array is bottom→top in ag-psd.
  if (Array.isArray((psd as unknown as { children?: LayerNode[] }).children)) {
    (psd as unknown as { children: LayerNode[] }).children.forEach(drawLayer);
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
