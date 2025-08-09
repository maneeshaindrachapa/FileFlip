import ImageConvertSection from "@/components/image-convert/image-convert-section";
import LandingHero from "@/components/landing-page/landing-hero";
import LandingNavigationMenu from "@/components/landing-page/navigation-menu";

export default function Home() {
  return (
    <>
      <LandingNavigationMenu />
      <LandingHero />
      <ImageConvertSection />
    </>
  );
}
