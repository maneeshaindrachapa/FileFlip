"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ubuntu } from "@/lib/fonts";
import { PiFileDuotone, PiVideoLight } from "react-icons/pi";
import { HiPhotograph } from "react-icons/hi";
import { GiWhiteBook } from "react-icons/gi";
import { AiOutlineCalculator } from "react-icons/ai";
import { BsCurrencyExchange } from "react-icons/bs";

const tiles = [
  { href: "/video", icon: PiVideoLight, label: "Convert a Video & Audio" },
  { href: "/photo", icon: HiPhotograph, label: "Convert an Image" },
  { href: "/document", icon: PiFileDuotone, label: "Convert a Document" },
  { href: "/ebook", icon: GiWhiteBook, label: "Convert an eBook" },
  { href: "/units", icon: AiOutlineCalculator, label: "Convert Units" },
  { href: "/currency", icon: BsCurrencyExchange, label: "Convert Currencies" },
];

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-[black] text-white">
      <div className="mx-auto max-w-6xl px-5 pt-14 pb-20">
        {/* Headline */}
        <div className={`${ubuntu.className} text-left md:text-left`}>
          <p className="text-indigo-300 font-semibold tracking-wide">
            End-to-end
          </p>
          <h1 className="mt-1 text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight">
            Conversion Platform
          </h1>
          <p className="mt-4 max-w-2xl text-white/70">
            From media files to units — convert everything you need in seconds,
            right in your browser.
          </p>
        </div>

        {/* Tiles row */}
        <div className="mt-10 flex flex-wrap gap-4">
          {tiles.map((t, i) => (
            <Tile
              key={t.href}
              href={t.href}
              index={i}
              icon={t.icon}
              label={t.label}
            />
          ))}
        </div>

        {/* Big circular watermark on the right */}
        <div className="pointer-events-none absolute right-[-140px] top-28 hidden md:block">
          {/* <CircularWatermark /> */}
        </div>

        {/* Two feature cards (placeholder, optional) */}
        {/* Add your content sections here as needed */}
      </div>
    </section>
  );
}

/* --- motion tile --- */
function Tile({
  href,
  icon: Icon,
  label,
  index,
}: {
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{
        delay: 0.06 * index,
        type: "spring",
        stiffness: 300,
        damping: 24,
      }}
      whileHover={{
        y: -4,
        boxShadow: "0 12px 40px -16px rgba(59,130,246,0.5)",
      }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group rounded-xl border border-white/10backdrop-blur",
        "px-4 py-4 w-full sm:w-auto sm:min-w-[220px]",
        "shadow-[0_10px_40px_-18px_rgba(0,0,0,0.7)] transition"
      )}
    >
      <Link href={href} className="flex flex-col items-start gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-lg transition">
          <Icon className="h-8 w-8 text-white/90" />
        </span>
        <span
          className={`${ubuntu.className} text-sm font-medium text-white/85 group-hover:text-white transition`}
        >
          {label}
        </span>
      </Link>
    </motion.div>
  );
}

/* --- watermark graphic --- */
function CircularWatermark() {
  return (
    <svg
      width="520"
      height="520"
      viewBox="0 0 520 520"
      className="opacity-[0.15] text-indigo-300"
    >
      <defs>
        <linearGradient id="wm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" />
          <stop offset="100%" stopColor="currentColor" />
        </linearGradient>
      </defs>
      <circle
        cx="260"
        cy="260"
        r="220"
        fill="none"
        stroke="url(#wm)"
        strokeWidth="46"
        strokeLinecap="round"
        strokeDasharray="220 110"
      />
      <circle
        cx="260"
        cy="260"
        r="150"
        fill="none"
        stroke="url(#wm)"
        strokeWidth="46"
        strokeLinecap="round"
        strokeDasharray="160 80"
      />
    </svg>
  );
}
