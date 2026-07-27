"use client";

import Image from "next/image";
import { useState } from "react";

export function WorkbookCover({
  title,
  src,
  priority = false
}: {
  title: string;
  src: string | null;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-[16px] border border-[#d8c7ad] bg-white shadow-[0_8px_20px_rgba(80,58,39,0.1)]">
      {src && !failed ? (
        <Image
          src={src}
          alt={`${title} printable first-grade homeschool workbook cover`}
          fill
          priority={priority}
          unoptimized={src.startsWith("http")}
          sizes="(min-width: 1024px) 210px, (min-width: 640px) 26vw, 42vw"
          className="object-contain p-2.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[#fffaf2] p-4 text-center">
          <Image
            src="/tree-icon.png"
            alt=""
            width={70}
            height={70}
            className="h-14 w-14 object-contain opacity-70"
          />
          <span className="absolute bottom-5 text-xs font-bold text-earth">
            Printable workbook
          </span>
        </div>
      )}
    </div>
  );
}

export function CurriculumBundleCover({
  title,
  src,
  priority = false
}: {
  title: string;
  src: string | null;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative aspect-square overflow-hidden rounded-[24px] border border-[#d8c7ad] bg-white shadow-[0_12px_28px_rgba(80,58,39,0.13)]">
      {src && !failed ? (
        <Image
          src={src}
          alt={`${title} complete printable first-grade homeschool curriculum bundle`}
          fill
          priority={priority}
          unoptimized={src.startsWith("http")}
          sizes="(min-width: 1024px) 520px, (min-width: 640px) 70vw, 90vw"
          className="object-contain p-3 sm:p-4"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#fffaf2] p-8 text-center">
          <Image
            src="/tree-icon.png"
            alt=""
            width={110}
            height={110}
            className="h-24 w-24 object-contain opacity-80"
          />
          <span className="label-font mt-5 text-sm font-black uppercase tracking-[0.1em] text-earth">
            Complete first-grade curriculum
          </span>
        </div>
      )}
    </div>
  );
}
