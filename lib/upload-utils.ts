export function extImageLabel(f: File) {
  const ext = f.name.split(".").pop()?.toLowerCase() || "";
  const mt = f.type;
  if (mt.includes("png") || ext === "png") return "PNG";
  if (
    mt.includes("jpeg") ||
    mt.includes("jpg") ||
    ext === "jpg" ||
    ext === "jpeg"
  )
    return "JPG";
  if (mt.includes("svg") || ext === "svg") return "SVG";
  if (mt.includes("webp") || ext === "webp") return "WEBP";
  if (mt.includes("gif") || ext === "gif") return "GIF";
  return ext.toUpperCase() || "FILE";
}
