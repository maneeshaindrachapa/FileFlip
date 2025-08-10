"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";
import { ubuntu } from "@/lib/fonts";

const MAX = 10 * 1024 * 1024; // 10MB ✅
const ACCEPT = "image/*,.svg,.gif,.ico,.psd,.ppm";

export default function Dropzone({
  onFiles,
}: {
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (list?: FileList | null) => {
    if (!list?.length) return;
    const picked: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX) {
        setErr(`"${f.name}" is larger than 10MB and was skipped.`);
        continue;
      }
      picked.push(f);
    }
    if (picked.length) onFiles(picked);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-2xl border border-[#212121]/10 bg-[#212121]/[0.04] p-6 text-center",
        over && "bg-[#212121]/[0.07]"
      )}
    >
      <div className={`${ubuntu.className} flex flex-col items-center gap-3`}>
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#212121]/5">
          <Upload className="h-6 w-6" />
        </div>
        <p className="text-sm text-[#212121]/80">Drag & drop images here, or</p>
        <Button
          onClick={() => inputRef.current?.click()}
          className="rounded-full"
          variant="secondary"
        >
          Browse Files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handle(e.target.files)}
        />
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      </div>
    </div>
  );
}
