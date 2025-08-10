import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Swap file extension: "book.epub" -> "book.pdf" */
export function swapExt(name: string, ext: string) {
  const i = name.lastIndexOf(".");
  const base = i >= 0 ? name.slice(0, i) : name;
  return `${base}.${ext}`;
}

/** Trigger a browser download for a Blob */
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

/** Extract readable text from an EPUB chapter’s HTML body */
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

/** Very simple text → PDF (monospace, wraps & paginates) */
export async function textToPdf(text: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const fontSize = 10;
  const margin = 36; // 0.5 inch
  const pageWidth = 612; // 8.5in * 72
  const pageHeight = 792; // 11in * 72
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

/** PDF (ArrayBuffer) -> plain text using pdf.js */
export async function pdfToPlainText(buf: ArrayBuffer): Promise<string> {
  const doc = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((it: any) => ("str" in it ? it.str : ""))
      .join(" ");
    out += line + "\n\n";
  }
  return out.trim();
}

/** Build a minimal EPUB (EPUB2) from plain text */
export async function createEpubFromText(opts: {
  title: string;
  author?: string;
  text: string;
}): Promise<Blob> {
  const { title, author = "Unknown", text } = opts;

  const zip = new JSZip();

  // Required: store 'mimetype' uncompressed
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const escaped = escapeXml(title);
  const id = "bookid-123";

  const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><title>${escaped}</title><meta charset="UTF-8"/></head>
<body>
${text
  .split(/\n{2,}/)
  .map((para) => `<p>${escapeXml(para)}</p>`)
  .join("\n")}
</body>
</html>`;

  zip.file("OEBPS/chapter1.xhtml", chapterXhtml);

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escaped}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">${id}</dc:identifier>
  </metadata>
  <manifest>
    <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chap1"/>
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${id}"/></head>
  <docTitle><text>${escaped}</text></docTitle>
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>Start</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
  zip.file("OEBPS/toc.ncx", ncx);

  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
  });
}

/** Parse EPUB -> { text, html[], imagesMap }.
 *  - html[]: array of chapter XHTML strings (cleaned but with <img> kept)
 *  - images: { href -> { mime, data: Uint8Array } } resolved against OPF base
 */
export async function parseEpub(
  buf: ArrayBuffer,
  onProgress?: (p: number) => void
): Promise<{
  text: string;
  html: string[];
  images: Record<string, { mime: string; data: Uint8Array }>;
}> {
  const zip = await JSZip.loadAsync(buf);
  onProgress?.(0.05);

  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const containerDoc = new DOMParser().parseFromString(
    containerXml,
    "application/xml"
  );
  const rootfile = containerDoc
    .querySelector("rootfile")
    ?.getAttribute("full-path");
  if (!rootfile) throw new Error("Invalid EPUB: cannot find OPF package.");

  const opfText = await zip.file(rootfile)?.async("text");
  if (!opfText) throw new Error("Invalid EPUB: missing OPF package.");
  const opfDoc = new DOMParser().parseFromString(opfText, "application/xml");

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

  const chapters: string[] = [];
  let textAll = "";

  // gather images by href (relative to OPF)
  const images: Record<string, { mime: string; data: Uint8Array }> = {};

  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i];
    const it = manifest[id];
    if (!it) continue;
    if (!/html|xhtml/.test(it.type)) continue;

    const docFile = zip.file(resPath(it.href));
    if (!docFile) continue;

    const html = await docFile.async("text");
    const doc = new DOMParser().parseFromString(html, "text/html");

    // collect image hrefs from this chapter
    doc.querySelectorAll("img[src]").forEach((img) => {
      const src = (img.getAttribute("src") || "").trim();
      if (!src) return;
      const key = resolveHref(it.href, src); // resolve against chapter file
      // find in zip
      if (!images[key]) {
        const mf = findManifestByHref(manifest, key);
        if (mf) {
          const zf = zip.file(resPath(mf.href));
          if (zf) {
            images[key] = { mime: mf.type, data: new Uint8Array() }; // placeholder
          }
        }
      }
    });

    // readable text (for txt/md/rtf/docx)
    const text = extractReadableText(doc.body);
    textAll += text + "\n\n";

    // keep chapter html (clean minimal)
    chapters.push(doc.body?.innerHTML || "");
    onProgress?.((i + 1) / spineIds.length);
  }

  // Load image binaries
  const entries = Object.entries(images);
  for (let i = 0; i < entries.length; i++) {
    const [key, v] = entries[i];
    const mf = findManifestByHref(manifest, key);
    if (!mf) continue;
    const zf = zip.file(resPath(mf.href));
    if (!zf) continue;
    const u8 = new Uint8Array(await zf.async("uint8array"));
    images[key] = { mime: mf.type, data: u8 };
  }

  return { text: textAll.trim(), html: chapters, images };

  function findManifestByHref(m: typeof manifest, hrefKey: string) {
    // match by normalized href (without './' segments)
    const norm = normalize(hrefKey);
    for (const k of Object.keys(m)) {
      if (normalize(m[k].href) === norm) return m[k];
    }
    return null;
  }
  function resolveHref(baseHref: string, rel: string) {
    const base = baseHref.split("/").slice(0, -1).join("/");
    const path = base ? `${base}/${rel}` : rel;
    return normalize(path);
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

/** EPUB -> Single HTML (embed images as data URIs) */
export async function epubToSingleHtml(
  chapters: string[],
  images: Record<string, { mime: string; data: Uint8Array }>
): Promise<Blob> {
  // data URI map by normalized key (filename)
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

/** HTML[] -> Markdown (basic), embed images via data URIs */
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
    // very simple: headings, paragraphs, images, links, lists
    let h = html;

    // images
    h = h.replace(
      /<img[^>]+alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi,
      (_m, alt, src) => {
        const key = src.split("/").pop() || src;
        const uri = dataUris[key] || src;
        return `![${alt || ""}](${uri})`;
      }
    );

    // links
    h = h.replace(
      /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
      (_m, href, txt) => `[${stripHtml(txt)}](${href})`
    );

    // headings
    h = h.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_m, c) => `# ${stripHtml(c)}\n\n`);
    h = h.replace(
      /<h2[^>]*>(.*?)<\/h2>/gi,
      (_m, c) => `## ${stripHtml(c)}\n\n`
    );
    h = h.replace(
      /<h3[^>]*>(.*?)<\/h3>/gi,
      (_m, c) => `### ${stripHtml(c)}\n\n`
    );

    // lists
    h = h.replace(/<li[^>]*>(.*?)<\/li>/gi, (_m, c) => `- ${stripHtml(c)}\n`);
    h = h.replace(/<\/ul>/gi, "\n");

    // paragraphs & line breaks
    h = h.replace(/<br\s*\/?>/gi, "\n");
    h = h.replace(/<p[^>]*>(.*?)<\/p>/gi, (_m, c) => `${stripHtml(c)}\n\n`);

    // strip remaining tags
    h = stripHtml(h);
    // cleanup
    return h.replace(/\n{3,}/g, "\n\n").trim();
  };

  return chapters.map(htmlToMd).join("\n\n---\n\n");

  function stripHtml(s: string) {
    return s
      .replace(/<\/?[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

/** Text -> RTF (basic text-only) */
export function textToRtf(text: string): string {
  // escape RTF control chars
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}");
  const body = esc(text).replace(/\n/g, "\\par\n");
  return `{\\rtf1\\ansi\n${body}\n}`;
}

/** Text -> minimal DOCX (paragraphs only, no images) */
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

/** EPUB -> PDF with images (very simple flow: text lines + images scaled to width) */
export async function epubToPdfWithImages(
  chapters: string[],
  images: Record<string, { mime: string; data: Uint8Array }>,
  onProgress?: (p: number) => void
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontSize = 12;
  const margin = 36;
  const pageWidth = 612,
    pageHeight = 792;
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
      page.drawText(ln, { x: margin, y: y - lineHeight, size: fontSize, font });
      y -= lineHeight;
    }
  };

  // build a map filename -> bytes
  const imgMap: Record<string, Uint8Array> = {};
  for (const [href, { data, mime }] of Object.entries(images)) {
    // pdf-lib supports JPEG/PNG
    const fname = href.split("/").pop() || href;
    if (/jpeg|jpg|png/i.test(mime)) imgMap[fname] = data;
  }

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];

    // images in chapter
    const imgTags = Array.from(
      ch.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
    );
    // split by <img> to interleave text and images
    const parts = ch.split(/<img[^>]+src=["'][^"']+["'][^>]*>/gi);

    for (let k = 0; k < parts.length; k++) {
      const txt = stripHtml(parts[k]).trim();
      if (txt) pushLine(txt);

      const m = imgTags[k];
      if (m) {
        const filename = (m[1].split("/").pop() || m[1]).trim();
        const bytes = imgMap[filename];
        if (bytes) {
          // embed image
          let img: any;
          try {
            img = await pdf.embedPng(bytes);
          } catch {
            try {
              img = await pdf.embedJpg(bytes);
            } catch {}
          }
          if (img) {
            const iw = img.width,
              ih = img.height;
            const scale = Math.min(maxWidth / iw, 1);
            const w = iw * scale,
              h = ih * scale;
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
    onProgress?.(i / chapters.length);
    // chapter separator
    y -= lineHeight;
    if (y < margin + lineHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  return await pdf.save();

  function stripHtml(s: string) {
    return s.replace(/<\/?[^>]+>/g, " ").replace(/\s+/g, " ");
  }
}

/** PDF -> EPUB with page images (render each PDF page to PNG, wrap in XHTML) */
export async function pdfToEpubWithPageImages(
  buf: ArrayBuffer,
  opts: { title: string; author?: string; onProgress?: (p: number) => void }
): Promise<Blob> {
  const { title, author = "Unknown", onProgress } = opts;
  const zip = new JSZip();

  // required files
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );

  // render pages to PNG
  const doc = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  const pageIds: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 }); // decent resolution
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), "image/png")
    );
    const u8 = new Uint8Array(await blob.arrayBuffer());
    const fname = `page-${String(p).padStart(4, "0")}.png`;
    zip.file(`OEBPS/media/${fname}`, u8);
    pageIds.push(fname);
    onProgress?.(p / doc.numPages);
  }

  // xhtml pages
  const xhtmlNames: string[] = [];
  for (let i = 0; i < pageIds.length; i++) {
    const img = pageIds[i];
    const xname = `page-${String(i + 1).padStart(4, "0")}.xhtml`;
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;">
  <div style="text-align:center;">
    <img src="media/${img}" alt="Page ${
      i + 1
    }" style="max-width:100%;height:auto;"/>
  </div>
</body>
</html>`;
    zip.file(`OEBPS/${xname}`, xhtml);
    xhtmlNames.push(xname);
  }

  // OPF + NCX
  const id = "pdf-as-epub";
  const manifestItems = xhtmlNames
    .map(
      (n, i) =>
        `<item id="chap${
          i + 1
        }" href="${n}" media-type="application/xhtml+xml"/>`
    )
    .join("\n");
  const spine = xhtmlNames
    .map((_n, i) => `<itemref idref="chap${i + 1}"/>`)
    .join("\n");
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">${id}</dc:identifier>
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

  const nav = xhtmlNames
    .map(
      (n, i) =>
        `<navPoint id="p${i + 1}" playOrder="${i + 1}"><navLabel><text>Page ${
          i + 1
        }</text></navLabel><content src="${n}"/></navPoint>`
    )
    .join("\n");
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${id}"/></head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>${nav}</navMap>
</ncx>`;
  zip.file("OEBPS/toc.ncx", ncx);

  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
  });
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
function wrapText(text: string, font: any, size: number, maxWidth: number) {
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
