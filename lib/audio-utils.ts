"use client";

import { FFmpeg, type LogEvent, type ProgressEvent } from "@ffmpeg/ffmpeg";

/** Single in-memory ffmpeg instance */
let _ffmpeg: FFmpeg | null = null;
let _loading: Promise<void> | null = null;

export type AudioTarget = "m4a" | "mp3" | "wav" | "flac" | "aiff";

export type OnProgress = (ratio0to1: number) => void;

export type ConvertResult = {
  data: Uint8Array;
  mime: string;
  filename: string;
};

export type InitOptions = {
  /** Log FFmpeg messages (default: true in dev). */
  log?: boolean;
};

let _options: Required<InitOptions> = {
  log: process.env.NODE_ENV !== "production",
};

export function configureFfmpeg(options: InitOptions) {
  _options = { ..._options, ...options };
}

/** Lazy init singleton (browser only) */
async function getFfmpeg(): Promise<FFmpeg> {
  if (typeof window === "undefined") {
    throw new Error("FFmpeg can only run in the browser.");
  }
  if (_ffmpeg) return _ffmpeg;

  if (!_loading) {
    _loading = (async () => {
      const ffmpeg = new FFmpeg();
      if (_options.log) {
        ffmpeg.on("log", (e: LogEvent) => {
          console.debug("[ffmpeg]", e.message);
        });
      }
      await ffmpeg.load();
      _ffmpeg = ffmpeg;
    })();
  }
  await _loading;
  return _ffmpeg!;
}

/** MIME by target container */
const MIME_BY_TARGET: Record<AudioTarget, string> = {
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aiff: "audio/aiff",
};

/** Args per target (simple & predictable) */
function buildArgs(target: AudioTarget): string[] {
  switch (target) {
    case "m4a":
      // AAC LC (native), 192k CBR
      return ["-c:a", "aac", "-b:a", "192k"];
    case "mp3":
      // libmp3lame, 192k CBR
      return ["-c:a", "libmp3lame", "-b:a", "192k"];
    case "wav":
      // PCM s16le, 44.1k stereo
      return ["-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2"];
    case "flac":
      return ["-c:a", "flac"];
    case "aiff":
      // PCM s16be, 44.1k stereo
      return ["-c:a", "pcm_s16be", "-ar", "44100", "-ac", "2"];
  }
}

/** Normalize extension from filename */
function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Safely turn a Uint8Array into an ArrayBuffer (avoids SAB typing issues) */
function toSafeArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = u8;
  // Fast path when it's already a real ArrayBuffer
  if (buffer instanceof ArrayBuffer) {
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  // Fallback for SharedArrayBuffer (or anything else): copy into a fresh ArrayBuffer
  const ab = new ArrayBuffer(byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

function asUint8(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return new Uint8Array(
      v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)
    );
  }
  if (typeof data === "string") {
    // Some older/broken typings can give string—encode to bytes.
    return new TextEncoder().encode(data);
  }
  throw new Error("Unexpected readFile() result type");
}

/** Convert in-browser with @ffmpeg/ffmpeg (≤100MB recommended) */
export async function convertAudioBrowser(
  file: File,
  target: AudioTarget,
  onProgress?: OnProgress
): Promise<ConvertResult> {
  if (file.size > 100 * 1024 * 1024) {
    throw new Error(
      "File is larger than 100MB; too heavy for in-browser conversion."
    );
  }

  const ffmpeg = await getFfmpeg();

  // Wire progress
  let detach: (() => void) | null = null;
  if (onProgress) {
    const handler = (e: ProgressEvent) => {
      const ratio =
        typeof (e as unknown as { progress?: number }).progress === "number"
          ? (e as unknown as { progress: number }).progress
          : (e as unknown as { ratio?: number }).ratio ?? 0;
      onProgress(Math.max(0, Math.min(1, ratio)));
    };
    ffmpeg.on("progress", handler);
    detach = () => ffmpeg.off("progress", handler);
  }

  try {
    const inExt = extOf(file.name) || "bin";
    const outExt = target;
    const inName = `in.${inExt}`;
    const outName = `out.${outExt}`;

    // Write input to the virtual FS
    const inputBytes = new Uint8Array(await file.arrayBuffer());
    await ffmpeg.writeFile(inName, inputBytes);

    // Run conversion
    const args = ["-y", "-i", inName, ...buildArgs(target), outName];
    await ffmpeg.exec(args);

    // Read output (Uint8Array or ArrayBuffer)
    const outData = await ffmpeg.readFile(outName);
    const data = asUint8(outData);

    // Cleanup FS (best-effort)
    try {
      await ffmpeg.deleteFile(inName);
      await ffmpeg.deleteFile(outName);
    } catch {
      /* ignore */
    }

    const mime = MIME_BY_TARGET[target];
    const base = file.name.replace(/\.[^.]+$/, "");
    const filename = `${base}.${outExt}`;

    return { data, mime, filename };
  } finally {
    if (detach) detach();
  }
}

/** Which targets are realistic without a custom core */
export function supportedTargets(): AudioTarget[] {
  return ["m4a", "mp3", "wav", "flac", "aiff"];
}

/** Very permissive accept list — FFmpeg validates actual content */
export const ACCEPTED_AUDIO_EXTS = [
  ".aac",
  ".ac3",
  ".aif",
  ".aiff",
  ".aifc",
  ".amr",
  ".au",
  ".caf",
  ".dss",
  ".flac",
  ".m4a",
  ".m4b",
  ".mp3",
  ".oga",
  ".ogg",
  ".voc",
  ".wav",
  ".wma",
] as const;

/** Create a Blob URL for download (fixes SAB typing complaints) */
export function makeDownloadUrlFromResult(result: ConvertResult): {
  url: string;
  name: string;
} {
  const ab = toSafeArrayBuffer(result.data);
  const blob = new Blob([ab], { type: result.mime });
  return { url: URL.createObjectURL(blob), name: result.filename };
}
