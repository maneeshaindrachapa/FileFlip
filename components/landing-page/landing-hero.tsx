"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ubuntu } from "@/lib/fonts";
import { PiFileAudioBold, PiFileDuotone } from "react-icons/pi";
import { HiPhotograph } from "react-icons/hi";
import { GiWhiteBook } from "react-icons/gi";
import { AiOutlineCalculator } from "react-icons/ai";
import { BsClockHistory } from "react-icons/bs";

const tiles = [
  { href: "#audio", icon: PiFileAudioBold, label: "Convert an Audio" },
  { href: "#image", icon: HiPhotograph, label: "Convert an Image" },
  { href: "#document", icon: PiFileDuotone, label: "Convert a Document" },
  { href: "#ebook", icon: GiWhiteBook, label: "Convert an eBook" },
  { href: "#units", icon: AiOutlineCalculator, label: "Convert Units" },
  { href: "#epoch", icon: BsClockHistory, label: "Convert Epoch Time" },
];

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-transparent text-[#212121]">
      <div className="mx-auto max-w-6xl px-5 pt-14 pb-20">
        {/* Headline */}
        <div className={`${ubuntu.className} text-left md:text-left`}>
          <p className="text-[#212121] font-semibold tracking-wide">
            End-to-end
          </p>
          <h1 className="mt-1 text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight">
            Conversion Platform
          </h1>
          <p className="mt-4 max-w-2xl text-[#212121]/70">
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
      </div>
    </section>
  );
}

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
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      const y = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: y - 80,
        behavior: "smooth",
      });
    }
  };

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
        "group rounded-xl border border-white/10 backdrop-blur",
        "px-4 py-4 w-full sm:w-auto sm:min-w-[220px]",
        "shadow-[0_10px_40px_-18px_rgba(0,0,0,0.7)] transition"
      )}
    >
      <a
        href={href}
        onClick={handleClick}
        className="flex flex-col items-start gap-3"
      >
        <span className="grid h-12 w-12 place-items-center rounded-lg transition">
          <Icon className="h-8 w-8 text-[#212121]/90" />
        </span>
        <span
          className={`${ubuntu.className} text-sm font-medium text-[#212121]/85 group-hover:text-[#212121] transition`}
        >
          {label}
        </span>
      </a>
    </motion.div>
  );
}
