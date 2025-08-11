"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Folder, LucideFolderCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ubuntu } from "@/lib/fonts";
import { animate } from "framer-motion";

type Props = {
  convertedCount?: number;
  brand?: string;
};

const LINKS = [
  { href: "#video", label: "Video & Audio" },
  { href: "#image", label: "Photo" },
  { href: "#document", label: "Document" },
  { href: "#ebook", label: "eBook" },
  { href: "#units", label: "Units" },
  { href: "#epoch", label: "Epoch" },
];

export default function LandingNavigationMenu({
  convertedCount = 0,
  brand = "FlipFile",
}: Props) {
  const [shadow, setShadow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setShadow(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Smooth scroll using Framer Motion
  const smoothScrollTo = (hash: string) => {
    const el = document.querySelector(hash) as HTMLElement | null;
    if (!el) return;

    // Offset for sticky header (adjust as needed)
    const OFFSET = 72;
    const targetY = el.getBoundingClientRect().top + window.scrollY - OFFSET;

    // Animate the scroll position
    animate(window.scrollY, targetY, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1], // easeOutCubic-ish
      onUpdate: (v) => window.scrollTo(0, v),
    });

    // Update hash without jumping
    history.replaceState(null, "", hash);
  };

  const handleNavClick =
    (hash: string, closeSheet?: boolean) =>
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      smoothScrollTo(hash);
      if (closeSheet) setOpen(false);
    };

  return (
    <div
      className={cn(
        "sticky top-0 z-50 w-full",
        "bg-[white] text-[#212121]",
        shadow && "shadow-[0_6px_20px_-12px_rgba(0,0,0,0.6)]"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-3 sm:px-4">
        {/* Left: brand + mobile hamburger */}
        <div className="flex items-center gap-2">
          {/* Mobile: hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 h-9 w-9 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <LucideFolderCog className="h-5 w-5" />
                  <span className="font-semibold">{brand}</span>
                </SheetTitle>
              </SheetHeader>
              <nav
                className={`${ubuntu.className} mt-6 flex flex-col text-[#212121]`}
              >
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={handleNavClick(l.href, true)}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 px-3 border-t pt-4 text-xs text-[#212121]">
                {convertedCount.toLocaleString()} files converted
              </div>
            </SheetContent>
          </Sheet>

          {/* Brand (click scrolls to top smoothly) */}
          <Link
            href="/"
            onClick={(e) => {
              if (location.pathname === "/") {
                e.preventDefault();
                animate(window.scrollY, 0, {
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                  onUpdate: (v) => window.scrollTo(0, v),
                });
                history.replaceState(null, "", "/");
              }
            }}
            className="flex items-center gap-2"
          >
            <Folder className="h-5 w-5" />
            <span
              className={`${ubuntu.className} font-semibold tracking-tight`}
            >
              {brand}
            </span>
          </Link>
        </div>

        {/* Center: desktop links */}
        <div className="hidden md:block">
          <NavigationMenu>
            <NavigationMenuList className={`${ubuntu.className} gap-4`}>
              {LINKS.map((l) => (
                <NavigationMenuItem key={l.href}>
                  <Link
                    href={l.href}
                    onClick={handleNavClick(l.href)}
                    className={cn(
                      "text-sm text-[#212121]/80 hover:text-[#212121] transition relative inline-block after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 hover:after:scale-x-100"
                    )}
                  >
                    {l.label}
                  </Link>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Right: counter + CTA (desktop) */}
        <div className="hidden items-center gap-3 md:flex">
          <div
            className={`${ubuntu.className} text-xs rounded-full border border-white/15 px-2.5 py-1 text-[#212121]/75`}
            title="Files converted"
          >
            {convertedCount.toLocaleString()}&nbsp;
            <span className="text-[#212121]/50">
              {" "}
              files We&apos;ve converted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
