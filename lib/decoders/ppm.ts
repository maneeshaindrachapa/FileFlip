export async function decodePPM(file: File): Promise<HTMLImageElement> {
  const buf = new Uint8Array(await file.arrayBuffer());

  const readToken = (): string => {
    // Skip whitespace & comments
    while (i < buf.length) {
      const c = buf[i];
      if (c === 35) {
        // '#'
        while (i < buf.length && buf[i] !== 10) i++;
      } else if (c <= 32) {
        i++;
      } else break;
    }
    const start = i;
    while (i < buf.length && buf[i] > 32) i++;
    return decoder.decode(buf.subarray(start, i));
  };

  const decoder = new TextDecoder("ascii");
  const magic = decoder.decode(buf.subarray(0, 2));
  if (magic !== "P6" && magic !== "P3") {
    throw new Error("Unsupported PPM format (only P6/P3 allowed)");
  }

  let i = 2;
  const width = parseInt(readToken(), 10);
  const height = parseInt(readToken(), 10);
  const maxVal = parseInt(readToken(), 10);
  if (!width || !height || !maxVal) throw new Error("Invalid PPM header");

  if (magic === "P6") {
    // Skip *all* whitespace after header until binary starts
    while (i < buf.length && buf[i] <= 32) i++;
    const needed = width * height * 3;
    if (i + needed > buf.length) throw new Error("PPM data truncated");

    const rgb = buf.subarray(i, i + needed);
    const rgba = rgbToRgba(rgb);
    return imageFromRGBA(rgba, width, height);
  }

  // P3 ASCII case
  const tokens: number[] = [];
  while (tokens.length < width * height * 3 && i < buf.length) {
    const tk = readToken();
    if (!tk) break;
    const v = parseInt(tk, 10);
    if (!Number.isNaN(v)) tokens.push(v);
  }
  if (tokens.length < width * height * 3) {
    throw new Error("PPM data truncated (P3)");
  }

  // Convert to RGBA
  const rgba = new Uint8ClampedArray(width * height * 4);
  let t = 0;
  for (let p = 0; p < width * height; p++) {
    const r = tokens[t++],
      g = tokens[t++],
      b = tokens[t++];
    const base = p * 4;
    if (maxVal === 255) {
      rgba[base] = r;
      rgba[base + 1] = g;
      rgba[base + 2] = b;
    } else {
      rgba[base] = Math.round((r * 255) / maxVal);
      rgba[base + 1] = Math.round((g * 255) / maxVal);
      rgba[base + 2] = Math.round((b * 255) / maxVal);
    }
    rgba[base + 3] = 255;
  }

  return imageFromRGBA(rgba, width, height);
}

function rgbToRgba(rgb: Uint8Array): Uint8ClampedArray {
  const px = rgb.length / 3;
  const out = new Uint8ClampedArray(px * 4);
  for (let p = 0, s = 0, d = 0; p < px; p++) {
    out[d++] = rgb[s++];
    out[d++] = rgb[s++];
    out[d++] = rgb[s++];
    out[d++] = 255;
  }
  return out;
}

function imageFromRGBA(
  data: Uint8ClampedArray,
  w: number,
  h: number
): Promise<HTMLImageElement> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");

  // Create ImageData with the canvas context, then set pixels
  const imgData = ctx.createImageData(w, h);
  imgData.data.set(data);
  ctx.putImageData(imgData, 0, 0);

  return new Promise((res, rej) => {
    canvas.toBlob((blob) => {
      if (!blob) return rej(new Error("Failed to export PPM image"));
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        res(img);
      };
      img.onerror = () => rej(new Error("Failed to load rendered PPM"));
      img.src = url;
    }, "image/png");
  });
}
