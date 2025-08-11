import JSZip from "jszip";
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";

/* -----------------------------------------------------------
   pdf.js (legacy) — lazy loaded so it never runs during SSR
----------------------------------------------------------- */
type PdfJsPageViewport = {
  width: number;
  height: number;
  transform?: number[];
};
type PdfJsTextItem = { str: string };
type PdfJsTextContent = { items: Array<PdfJsTextItem | unknown> };
type PdfJsRenderTask = { promise: Promise<void> };

type PdfJsPage = {
  getTextContent: () => Promise<PdfJsTextContent>;
  getViewport: (opts: { scale: number }) => PdfJsPageViewport;
  render: (opts: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsPageViewport;
  }) => PdfJsRenderTask;
};

type PdfJsLoadedDoc = {
  numPages: number;
  getPage: (p: number) => Promise<PdfJsPage>;
};

type PdfJsNamespace = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { data: ArrayBuffer }) => {
    promise: Promise<PdfJsLoadedDoc>;
  };
};

let _pdfjs: PdfJsNamespace | null = null;

async function getPdfjs(): Promise<PdfJsNamespace> {
  if (_pdfjs) return _pdfjs;
  if (typeof window === "undefined") {
    throw new Error("pdf.js can only be loaded in the browser");
  }
  const mod = (await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  )) as unknown as PdfJsNamespace;
  mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  _pdfjs = mod;
  return mod;
}

/* -----------------------------------------------------------
   Shared helpers
----------------------------------------------------------- */

export function swapExt(name: string, ext: string) {
  const i = name.lastIndexOf(".");
  const base = i >= 0 ? name.slice(0, i) : name;
  return `${base}.${ext}`;
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function u8ToBase64(u8: Uint8Array) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function stripAllHtml(s: string) {
  return s
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const widthOf = (s: string) => font.widthOfTextAtSize(s, size);
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (widthOf(test) <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      if (widthOf(w) > maxWidth) {
        let chunk = "";
        for (const ch of w.split("")) {
          const t = chunk + ch;
          if (widthOf(t) > maxWidth) {
            if (chunk) lines.push(chunk);
            chunk = ch;
          } else chunk = t;
        }
        line = chunk;
      } else line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Extract readable text from an EPUB/HTML chapter body */
export function extractReadableText(root: HTMLElement | null) {
  if (!root) return "";
  root
    .querySelectorAll("script, style, nav, header, footer")
    .forEach((n) => n.remove());
  root.querySelectorAll("br").forEach((br) => (br.outerHTML = "\n"));

  const blocks = new Set([
    "P",
    "DIV",
    "SECTION",
    "ARTICLE",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LI",
    "UL",
    "OL",
    "TABLE",
    "FIGURE",
    "BLOCKQUOTE",
  ]);

  let text = "";
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );
  while (walker.nextNode()) {
    const node = walker.currentNode as HTMLElement | Text;
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.nodeValue || "").replace(/\s+/g, " ").trim() + " ";
    } else {
      const el = node as HTMLElement;
      if (blocks.has(el.tagName)) text += "\n";
    }
  }

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -----------------------------------------------------------
   BookModel (generic in-memory representation)
----------------------------------------------------------- */
export type Chapter = { title?: string; html: string };
export type ImageAsset = { id: string; mime: string; data: Uint8Array };
export type BookModel = {
  title?: string;
  author?: string;
  chapters: Chapter[];
  images: Record<string, ImageAsset>;
};

/* -----------------------------------------------------------
   Parsers to BookModel
----------------------------------------------------------- */
// EPUB -> BookModel (keeps chapter HTML and images)
export async function parseEpub(
  buf: ArrayBuffer,
  onProgress?: (p: number) => void
): Promise<{
  text: string;
  html: string[];
  images: Record<string, { mime: string; data: Uint8Array }>;
}> {
  const model = await parseEPUBToModel(buf, onProgress);
  const text = model.chapters
    .map((c) => {
      const doc = new DOMParser().parseFromString(c.html || "", "text/html");
      return extractReadableText(doc.body);
    })
    .join("\n\n");
  const html = model.chapters.map((c) => c.html || "");
  const images: Record<string, { mime: string; data: Uint8Array }> = {};
  for (const im of Object.values(model.images)) {
    images[im.id] = { mime: im.mime, data: im.data };
  }
  return { text, html, images };
}

async function parseEPUBToModel(
  buf: ArrayBuffer,
  onProgress?: (p: number) => void
): Promise<BookModel> {
  const zip = await JSZip.loadAsync(buf);
  onProgress?.(0.05);

  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const containerDoc = new DOMParser().parseFromString(
    containerXml,
    "application/xml"
  );
  const rootfile =
    containerDoc.querySelector("rootfile")?.getAttribute("full-path") || "";
  if (!rootfile) throw new Error("Invalid EPUB: cannot find OPF package.");

  const opfText = await zip.file(rootfile)?.async("text");
  if (!opfText) throw new Error("Invalid EPUB: missing OPF package.");
  const opfDoc = new DOMParser().parseFromString(opfText, "application/xml");

  const title =
    opfDoc.querySelector("metadata > *|dc\\:title, metadata > dc\\:title")
      ?.textContent || undefined;
  const author =
    opfDoc.querySelector("metadata > *|dc\\:creator, metadata > dc\\:creator")
      ?.textContent || undefined;

  const manifest: Record<string, { href: string; type: string }> = {};
  opfDoc.querySelectorAll("manifest > item").forEach((it) => {
    const id = it.getAttribute("id") || "";
    const href = it.getAttribute("href") || "";
    const type = it.getAttribute("media-type") || "";
    manifest[id] = { href, type };
  });

  const spineIds: string[] = [];
  opfDoc.querySelectorAll("spine > itemref").forEach((ir) => {
    const idref = ir.getAttribute("idref");
    if (idref) spineIds.push(idref);
  });
  if (!spineIds.length) throw new Error("Invalid EPUB: empty spine.");

  const baseDir = rootfile.split("/").slice(0, -1).join("/");
  const resPath = (p: string) => (baseDir ? `${baseDir}/${p}` : p);

  const chapters: Chapter[] = [];
  const images: Record<string, ImageAsset> = {};

  const imageHrefs = new Set<string>();
  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i];
    const it = manifest[id];
    if (!it || !/html|xhtml/i.test(it.type)) continue;

    const docFile = zip.file(resPath(it.href));
    if (!docFile) continue;

    const html = await docFile.async("text");
    const doc = new DOMParser().parseFromString(html, "text/html");

    doc.querySelectorAll("img[src]").forEach((img) => {
      const src = (img.getAttribute("src") || "").trim();
      if (!src) return;
      const resolved = normalize(joinHref(it.href, src));
      imageHrefs.add(resolved);
    });

    chapters.push({ html: doc.body?.innerHTML || "" });
    onProgress?.((i + 1) / spineIds.length);
  }

  // load images
  for (const href of imageHrefs) {
    const mf = Object.values(manifest).find((m) => normalize(m.href) === href);
    if (!mf) continue;
    const zf = zip.file(resPath(mf.href));
    if (!zf) continue;
    const data = new Uint8Array(await zf.async("uint8array"));
    const id = mf.href.split("/").pop() || mf.href;
    images[id] = { id, mime: mf.type, data };
  }

  return { title, author, chapters, images };

  function joinHref(baseHref: string, rel: string) {
    const base = baseHref.split("/").slice(0, -1).join("/");
    return base ? `${base}/${rel}` : rel;
  }
  function normalize(p: string) {
    const parts: string[] = [];
    for (const seg of p.split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  }
}

// CBZ -> BookModel (images as chapters)
export async function parseCBZToModel(buf: ArrayBuffer): Promise<BookModel> {
  const zip = await JSZip.loadAsync(buf);
  const files = zip
    .filter((p) => /^.*\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(p))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (!files.length) throw new Error("No images found in CBZ");
  const images: Record<string, ImageAsset> = {};
  const chapters: Chapter[] = [];

  for (const f of files) {
    const data = new Uint8Array(await f.async("uint8array"));
    const id = f.name.split("/").pop() || f.name;
    const mime = /\.png$/i.test(f.name)
      ? "image/png"
      : /\.jpe?g$/i.test(f.name)
      ? "image/jpeg"
      : /\.webp$/i.test(f.name)
      ? "image/webp"
      : /\.gif$/i.test(f.name)
      ? "image/gif"
      : /\.bmp$/i.test(f.name)
      ? "image/bmp"
      : /\.avif$/i.test(f.name)
      ? "image/avif"
      : "application/octet-stream";

    images[id] = { id, mime, data };
    chapters.push({
      html: `<div style="text-align:center;"><img src="${id}" alt="${id}" style="max-width:100%;height:auto;"/></div>`,
    });
  }

  return { title: undefined, author: undefined, chapters, images };
}

// FB2 -> BookModel (simple)
export async function parseFB2ToModel(buf: ArrayBuffer): Promise<BookModel> {
  const xml = new TextDecoder("utf-8").decode(new Uint8Array(buf));
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const title = doc.querySelector("book-title")?.textContent || undefined;
  const author =
    doc.querySelector("author > first-name")?.textContent ||
    doc.querySelector("author > nickname")?.textContent ||
    undefined;

  const bodies = Array.from(doc.querySelectorAll("body"));
  const chapters: Chapter[] = bodies.map((b) => {
    const htmlParas = Array.from(b.querySelectorAll("p"))
      .map((p) => `<p>${escapeXml(p.textContent || "")}</p>`)
      .join("\n");
    return { html: htmlParas };
  });

  return { title, author, chapters, images: {} };
}

// HTML -> BookModel
export async function parseHTMLToModel(buf: ArrayBuffer): Promise<BookModel> {
  const html = new TextDecoder("utf-8").decode(new Uint8Array(buf));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("title")?.textContent || undefined;
  const bodyHtml = doc.body?.innerHTML || "";
  return {
    title,
    author: undefined,
    chapters: [{ html: bodyHtml }],
    images: {},
  };
}

// HTMLZ -> BookModel
export async function parseHTMLZToModel(buf: ArrayBuffer): Promise<BookModel> {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file(/index\.x?html?$/i)[0] || zip.file(/\.x?html?$/i)[0];
  if (!entry) throw new Error("No HTML found in archive");

  const html = await entry.async("text");
  const doc = new DOMParser().parseFromString(html, "text/html");

  const images: Record<string, ImageAsset> = {};
  const imageFiles = zip.file(/\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i);
  for (const f of imageFiles) {
    const id = f.name.split("/").pop() || f.name;
    const data = new Uint8Array(await f.async("uint8array"));
    const mime = /\.png$/i.test(f.name)
      ? "image/png"
      : /\.jpe?g$/i.test(f.name)
      ? "image/jpeg"
      : /\.webp$/i.test(f.name)
      ? "image/webp"
      : /\.gif$/i.test(f.name)
      ? "image/gif"
      : /\.bmp$/i.test(f.name)
      ? "image/bmp"
      : /\.avif$/i.test(f.name)
      ? "image/avif"
      : /\.svg$/i.test(f.name)
      ? "image/svg+xml"
      : "application/octet-stream";
    images[id] = { id, mime, data };
  }

  return {
    title: doc.querySelector("title")?.textContent || undefined,
    author: undefined,
    chapters: [{ html: doc.body?.innerHTML || "" }],
    images,
  };
}

// TXT -> BookModel
export async function parseTXTToModel(buf: ArrayBuffer): Promise<BookModel> {
  const text = new TextDecoder("utf-8").decode(new Uint8Array(buf));
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeXml(p)}</p>`)
    .join("\n");
  return {
    title: undefined,
    author: undefined,
    chapters: [{ html }],
    images: {},
  };
}

// TXTZ -> BookModel
export async function parseTXTZToModel(buf: ArrayBuffer): Promise<BookModel> {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file(/\.txt$/i)[0];
  if (!entry) throw new Error("No TXT found in archive");
  const txt = await entry.async("text");
  const html = txt
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeXml(p)}</p>`)
    .join("\n");
  return {
    title: undefined,
    author: undefined,
    chapters: [{ html }],
    images: {},
  };
}

// PDF -> BookModel (each page rendered to PNG)
export async function parsePDFToModelAsImages(
  buf: ArrayBuffer,
  onProgress?: (p: number) => void
): Promise<BookModel> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const chapters: Chapter[] = [];
  const images: Record<string, ImageAsset> = {};
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("Canvas toBlob failed"))),
        "image/png"
      )
    );
    const data = new Uint8Array(await blob.arrayBuffer());
    const id = `page-${String(p).padStart(4, "0")}.png`;
    images[id] = { id, mime: "image/png", data };
    chapters.push({
      html: `<div style="text-align:center;"><img src="${id}" alt="Page ${p}" style="max-width:100%;height:auto;"/></div>`,
    });

    onProgress?.(Math.round((p / doc.numPages) * 100));
  }
  return { title: undefined, author: undefined, chapters, images };
}

/* -----------------------------------------------------------
   Exporters from BookModel
----------------------------------------------------------- */
// -> EPUB
export async function modelToEPUB(model: BookModel): Promise<Blob> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );

  // images
  const imageItems: string[] = [];
  for (const img of Object.values(model.images)) {
    zip.file(`OEBPS/media/${img.id}`, img.data);
    imageItems.push(
      `<item id="${escapeXml(img.id)}" href="media/${escapeXml(
        img.id
      )}" media-type="${img.mime}"/>`
    );
  }

  // chapters
  const chapterNames: string[] = [];
  model.chapters.forEach((ch, i) => {
    const name = `chap-${String(i + 1).padStart(4, "0")}.xhtml`;
    chapterNames.push(name);
    const fixed = (ch.html || "").replace(
      /<img([^>]+?)src=["']([^"']+)["']([^>]*)>/gi,
      (_m, a, src, b) => {
        const file = src.split("/").pop() || src;
        return `<img${a}src="media/${file}"${b}>`;
      }
    );
    zip.file(
      `OEBPS/${name}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><meta charset="UTF-8"/><title>${escapeXml(
        ch.title || model.title || "Chapter"
      )}</title></head>
<body>${fixed}</body>
</html>`
    );
  });

  const manifestItems =
    chapterNames
      .map(
        (n, i) =>
          `<item id="chap${
            i + 1
          }" href="${n}" media-type="application/xhtml+xml"/>`
      )
      .join("\n") + (imageItems.length ? "\n" + imageItems.join("\n") : "");

  const spine = chapterNames
    .map((_n, i) => `<itemref idref="chap${i + 1}"/>`)
    .join("\n");

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(model.title || "Untitled")}</dc:title>
    <dc:creator>${escapeXml(model.author || "Unknown")}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">book-${Date.now()}</dc:identifier>
  </metadata>
  <manifest>
    ${manifestItems}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    ${spine}
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  const nav = chapterNames
    .map(
      (n, i) =>
        `<navPoint id="p${i + 1}" playOrder="${
          i + 1
        }"><navLabel><text>Chapter ${
          i + 1
        }</text></navLabel><content src="${n}"/></navPoint>`
    )
    .join("\n");
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="book-${Date.now()}"/></head>
  <docTitle><text>${escapeXml(model.title || "Untitled")}</text></docTitle>
  <navMap>${nav}</navMap>
</ncx>`;
  zip.file("OEBPS/toc.ncx", ncx);

  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

// -> PDF (text + images)
export async function modelToPDF(model: BookModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontSize = 12;
  const margin = 36;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = fontSize * 1.4;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const pushLine = (s: string) => {
    const lines = wrapText(s, font, fontSize, maxWidth);
    for (const ln of lines) {
      if (y - lineHeight < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(ln, {
        x: margin,
        y: y - lineHeight,
        size: fontSize,
        font,
      });
      y -= lineHeight;
    }
  };

  // quick filename->bytes lookup
  const imgBytes: Record<string, Uint8Array> = {};
  for (const im of Object.values(model.images)) imgBytes[im.id] = im.data;

  for (const ch of model.chapters) {
    const imgTags = Array.from(
      (ch.html || "").matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
    );
    const parts = (ch.html || "").split(/<img[^>]+src=["'][^"']+["'][^>]*>/gi);

    for (let i = 0; i < parts.length; i++) {
      const text = stripAllHtml(parts[i]).trim();
      if (text) pushLine(text);

      const m = imgTags[i];
      if (m) {
        const file = (m[1].split("/").pop() || m[1]).trim();
        const bytes = imgBytes[file];
        if (bytes) {
          let img: PDFImage | undefined;
          try {
            img = await pdf.embedPng(bytes);
          } catch {
            try {
              img = await pdf.embedJpg(bytes);
            } catch {
              img = undefined;
            }
          }
          if (img) {
            const iw = img.width;
            const ih = img.height;
            const scale = Math.min(maxWidth / iw, 1);
            const w = iw * scale;
            const h = ih * scale;
            if (y - h < margin) {
              page = pdf.addPage([pageWidth, pageHeight]);
              y = pageHeight - margin;
            }
            page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
            y -= h + lineHeight * 0.5;
          }
        }
      }
    }

    y -= lineHeight;
    if (y < margin + lineHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  return pdf.save();
}

// -> single HTML (embed images as data URIs)
export async function modelToSingleHTML(model: BookModel): Promise<Blob> {
  const dataURIs: Record<string, string> = {};
  for (const img of Object.values(model.images)) {
    dataURIs[img.id] = `data:${img.mime};base64,${u8ToBase64(img.data)}`;
  }
  const body = model.chapters
    .map((c) =>
      (c.html || "").replace(
        /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
        (_m, src) => {
          const id = src.split("/").pop() || src;
          return _m.replace(src, dataURIs[id] || src);
        }
      )
    )
    .join("\n<hr/>\n");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(model.title || "Export")}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Ubuntu,Arial,sans-serif;line-height:1.6;padding:1.25rem;max-width:820px;margin:auto;}
    img{max-width:100%;height:auto;}
  </style>
</head>
<body>
${body}
</body>
</html>`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

// -> Markdown
export function modelToMarkdown(model: BookModel): string {
  const dataURIs: Record<string, string> = {};
  for (const img of Object.values(model.images)) {
    dataURIs[img.id] = `data:${img.mime};base64,${u8ToBase64(img.data)}`;
  }
  const htmlToMd = (html: string) => {
    let h = html;
    h = h.replace(
      /<img[^>]+alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi,
      (_m, alt, src) => {
        const id = src.split("/").pop() || src;
        const uri = dataURIs[id] || src;
        return `![${alt || ""}](${uri})`;
      }
    );
    h = h.replace(
      /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
      (_m, href, txt) => `[${stripAllHtml(txt)}](${href})`
    );
    h = h.replace(
      /<h1[^>]*>(.*?)<\/h1>/gi,
      (_m, c) => `# ${stripAllHtml(c)}\n\n`
    );
    h = h.replace(
      /<h2[^>]*>(.*?)<\/h2>/gi,
      (_m, c) => `## ${stripAllHtml(c)}\n\n`
    );
    h = h.replace(
      /<h3[^>]*>(.*?)<\/h3>/gi,
      (_m, c) => `### ${stripAllHtml(c)}\n\n`
    );
    h = h.replace(
      /<li[^>]*>(.*?)<\/li>/gi,
      (_m, c) => `- ${stripAllHtml(c)}\n`
    );
    h = h.replace(/<\/ul>/gi, "\n");
    h = h.replace(/<br\s*\/?>/gi, "\n");
    h = h.replace(/<p[^>]*>(.*?)<\/p>/gi, (_m, c) => `${stripAllHtml(c)}\n\n`);
    h = stripAllHtml(h);
    return h.replace(/\n{3,}/g, "\n\n").trim();
  };

  return model.chapters.map((c) => htmlToMd(c.html || "")).join("\n\n---\n\n");
}

// -> TXT
export function modelToText(model: BookModel): string {
  const parts = model.chapters.map((c) => {
    const doc = new DOMParser().parseFromString(c.html || "", "text/html");
    return extractReadableText(doc.body);
  });
  return parts.join("\n\n");
}

/* -----------------------------------------------------------
   Legacy named helpers you already used (kept for compatibility)
----------------------------------------------------------- */

export async function pdfToPlainText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) =>
        typeof it === "object" &&
        it !== null &&
        "str" in (it as Record<string, unknown>)
          ? (it as PdfJsTextItem).str
          : ""
      )
      .join(" ");
    out += line + "\n\n";
  }
  return out.trim();
}

export async function epubToSingleHtml(
  chapters: string[],
  images: Record<string, { mime: string; data: Uint8Array }>
): Promise<Blob> {
  const dataUris: Record<string, string> = {};
  for (const [href, { mime, data }] of Object.entries(images)) {
    dataUris[href.split("/").pop() || href] = `data:${mime};base64,${u8ToBase64(
      data
    )}`;
  }
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>EPUB Export</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Ubuntu,Arial,sans-serif;line-height:1.6;padding:1.25rem;max-width:820px;margin:auto;}
  img{max-width:100%;height:auto;}
  h1,h2,h3{line-height:1.2}
</style>
</head>
<body>
${chapters
  .map((c) =>
    c.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (_m, src) => {
      const key = src.split("/").pop() || src;
      const uri = dataUris[key];
      return uri ? _m.replace(src, uri) : _m;
    })
  )
  .join("\n<hr/>\n")}
</body>
</html>`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

export function htmlArrayToMarkdown(
  chapters: string[],
  images: Record<string, { mime: string; data: Uint8Array }>
): string {
  const dataUris: Record<string, string> = {};
  for (const [href, { mime, data }] of Object.entries(images)) {
    dataUris[href.split("/").pop() || href] = `data:${mime};base64,${u8ToBase64(
      data
    )}`;
  }
  const htmlToMd = (html: string) => {
    let h = html;
    h = h.replace(
      /<img[^>]+alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi,
      (_m, alt, src) => {
        const key = src.split("/").pop() || src;
        const uri = dataUris[key] || src;
        return `![${alt || ""}](${uri})`;
      }
    );
    h = h.replace(
      /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
      (_m, href, txt) => `[${stripAllHtml(txt)}](${href})`
    );
    h = h.replace(
      /<h1[^>]*>(.*?)<\/h1>/gi,
      (_m, c) => `# ${stripAllHtml(c)}\n\n`
    );
    h = h.replace(
      /<h2[^>]*>(.*?)<\/h2>/gi,
      (_m, c) => `## ${stripAllHtml(c)}\n\n`
    );
    h = h.replace(
      /<h3[^>]*>(.*?)<\/h3>/gi,
      (_m, c) => `### ${stripAllHtml(c)}\n\n`
    );
    h = h.replace(
      /<li[^>]*>(.*?)<\/li>/gi,
      (_m, c) => `- ${stripAllHtml(c)}\n`
    );
    h = h.replace(/<\/ul>/gi, "\n");
    h = h.replace(/<br\s*\/?>/gi, "\n");
    h = h.replace(/<p[^>]*>(.*?)<\/p>/gi, (_m, c) => `${stripAllHtml(c)}\n\n`);
    h = stripAllHtml(h);
    return h.replace(/\n{3,}/g, "\n\n").trim();
  };

  return chapters.map(htmlToMd).join("\n\n---\n\n");
}

export function textToRtf(text: string): string {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}");
  const body = esc(text).replace(/\n/g, "\\par\n");
  return `{\\rtf1\\ansi\n${body}\n}`;
}

export async function textToMinimalDocx(text: string): Promise<Blob> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  const paras = text
    .split(/\n{2,}/)
    .map((p) => `<w:p><w:r><w:t>${escapeXml(p)}</w:t></w:r></w:p>`)
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paras}</w:body>
</w:document>`
  );

  return await zip.generateAsync({ type: "blob" });
}

/* EPUB -> PDF (legacy name you used) */
export async function epubToPdfWithImages(
  chapters: string[],
  images: Record<string, { mime: string; data: Uint8Array }>,
  onProgress?: (p: number) => void
): Promise<Uint8Array> {
  // Build temporary model and reuse modelToPDF
  const model: BookModel = {
    title: undefined,
    author: undefined,
    chapters: chapters.map((html) => ({ html })),
    images: Object.fromEntries(
      Object.entries(images).map(([href, v]) => {
        const id = href.split("/").pop() || href;
        return [id, { id, mime: v.mime, data: v.data }];
      })
    ),
  };
  const out = await modelToPDF(model);
  onProgress?.(1);
  return out;
}

/* PDF -> EPUB with images (legacy name you used) */
export async function pdfToEpubWithPageImages(
  buf: ArrayBuffer,
  opts: { title: string; author?: string; onProgress?: (p: number) => void }
): Promise<Blob> {
  const model = await parsePDFToModelAsImages(buf, opts.onProgress);
  model.title = opts.title;
  model.author = opts.author;
  return modelToEPUB(model);
}

/* Text -> PDF (you already had, keeping as-is) */
export async function textToPdf(text: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const fontSize = 10;
  const margin = 36;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = fontSize * 1.4;

  const lines = wrapText(text, font, fontSize, maxWidth);
  let y = pageHeight - margin;

  let page = pdf.addPage([pageWidth, pageHeight]);
  for (const line of lines) {
    if (y - lineHeight < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(line, {
      x: margin,
      y: y - lineHeight,
      size: fontSize,
      font,
    });
    y -= lineHeight;
  }
  return await pdf.save();
}

/* -----------------------------------------------------------
   Simple router helpers used by the UI
----------------------------------------------------------- */

export type SourceKind =
  | "epub"
  | "pdf"
  | "cbz"
  | "fb2"
  | "html"
  | "htmlz"
  | "txt"
  | "txtz";

export type TargetFmt = "pdf" | "txt" | "epub" | "html" | "md" | "rtf" | "docx";

export function sniffSource(fileName: string): SourceKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "epub":
      return "epub";
    case "pdf":
      return "pdf";
    case "cbz":
      return "cbz";
    case "fb2":
      return "fb2";
    case "html":
    case "htm":
      return "html";
    case "htmlz":
      return "htmlz";
    case "txt":
      return "txt";
    case "txtz":
      return "txtz";
    default:
      return null;
  }
}

export async function parseAnyToModel(
  file: File,
  onProgress?: (p: number) => void
): Promise<BookModel> {
  const buf = await file.arrayBuffer();
  const kind = sniffSource(file.name);
  if (!kind) throw new Error(`Unsupported input: ${file.name}`);

  switch (kind) {
    case "epub":
      return parseEPUBToModel(buf, onProgress);
    case "pdf":
      return parsePDFToModelAsImages(buf, onProgress);
    case "cbz":
      return parseCBZToModel(buf);
    case "fb2":
      return parseFB2ToModel(buf);
    case "html":
      return parseHTMLToModel(buf);
    case "htmlz":
      return parseHTMLZToModel(buf);
    case "txt":
      return parseTXTToModel(buf);
    case "txtz":
      return parseTXTZToModel(buf);
  }
}

export async function exportModel(
  model: BookModel,
  target: TargetFmt
): Promise<Blob | Uint8Array | string> {
  switch (target) {
    case "epub":
      return modelToEPUB(model);
    case "pdf":
      return modelToPDF(model);
    case "html":
      return modelToSingleHTML(model);
    case "md":
      return modelToMarkdown(model);
    case "txt":
      return modelToText(model);
    case "rtf":
      return textToRtf(modelToText(model));
    case "docx":
      return textToMinimalDocx(modelToText(model));
  }
}
