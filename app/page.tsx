"use client";
import AudioConverter from "@/components/convert/audio-converter";
import EbookConverter from "@/components/convert/ebook-converter";
import EpochConverter from "@/components/convert/epoch-converter";
import ImageConverterSection from "@/components/convert/image-converter";
import UnitConverter from "@/components/convert/unit-converter";
import LandingHero from "@/components/landing-page/landing-hero";
import LandingNavigationMenu from "@/components/landing-page/navigation-menu";
import { useState } from "react";

export default function Home() {
  const [convertedCount, setConvertedCount] = useState(0);

  const handleConversion = (size: number) => {
    setConvertedCount((prev) => prev + size);
  };
  return (
    <>
      <LandingNavigationMenu convertedCount={convertedCount} />

      {/* Shared container spacing for everything */}
      <div className=" mx-auto max-w-6xl px-5 py-12 space-y-12">
        <LandingHero />

        {/* Image converter section */}
        <section id="image">
          <ImageConverterSection onConvert={handleConversion} />
        </section>

        {/* Converters grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div id="ebook" className="w-full">
            <EbookConverter onConvert={handleConversion} />
          </div>
          <div id="audio" className="w-full">
            <AudioConverter onConvert={handleConversion} />
          </div>
        </section>
        <div id="units" className="w-full">
          <UnitConverter />
        </div>
        <div id="epoch" className="w-full col-span-3">
          <EpochConverter />
        </div>
      </div>
    </>
  );
}
