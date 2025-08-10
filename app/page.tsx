import CurrencyConverter from "@/components/convert/currency-converter";
import EpochConverter from "@/components/convert/epoch-convert";
import ImageConvertSection from "@/components/convert/image-convert-section";
import UnitConverter from "@/components/convert/unit-converter";
import LandingHero from "@/components/landing-page/landing-hero";
import LandingNavigationMenu from "@/components/landing-page/navigation-menu";

export default function Home() {
  return (
    <>
      <LandingNavigationMenu />

      {/* Shared container spacing for everything */}
      <div className="mx-auto max-w-6xl px-5 py-12 space-y-12">
        <LandingHero />

        {/* Image converter section */}
        <section id="image-convert">
          <ImageConvertSection />
        </section>

        {/* Converters grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Currency + Unit stacked with consistent spacing */}
          {/* <div className="flex flex-col gap-6 col-span-1">
            <div id="currency-convert" className="w-full">
              <CurrencyConverter />
            </div>
            <div id="unit-convert" className="w-full">
              <UnitConverter />
            </div>
          </div> */}

          {/* Right column: Epoch (let it fill height on desktop) */}
          <div id="epoch-convert" className="w-full col-span-3">
            <EpochConverter />
          </div>
        </section>
      </div>
    </>
  );
}
