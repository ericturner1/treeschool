"use client";

import Image from "next/image";
import { useState } from "react";

type GalleryImage = {
  url: string;
  alt: string;
  label: string;
};

export function WorkbookImageGallery({ images }: { images: GalleryImage[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = images[selectedIndex] ?? images[0];
  if (!selected) return null;

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] border border-[#e4d4bb] bg-white">
        <Image src={selected.url} alt={selected.alt} fill unoptimized className="object-contain p-4 sm:p-6" />
      </div>
      <p className="mt-3 text-center text-sm font-semibold text-ink/62">{selected.label}</p>
      {images.length > 1 ? (
        <div className="mt-4 grid grid-cols-5 gap-2" aria-label="Workbook preview images">
          {images.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`Show ${image.label}`}
              aria-pressed={selectedIndex === index}
              className={`relative aspect-[4/5] overflow-hidden rounded-[10px] border-2 bg-white transition ${
                selectedIndex === index
                  ? "border-[#6f944f] shadow-[0_0_0_2px_rgba(111,148,79,0.2)]"
                  : "border-[#dfcfb7] hover:border-[#9eb884]"
              }`}
            >
              <Image src={image.url} alt="" fill unoptimized className="object-contain p-1" />
            </button>
          ))}
        </div>
      ) : null}
      {images.length > 1 ? <p className="mt-3 text-center text-xs leading-5 text-ink/48">Low-resolution sample pages. The purchased PDF contains the full-quality workbook.</p> : null}
    </div>
  );
}
