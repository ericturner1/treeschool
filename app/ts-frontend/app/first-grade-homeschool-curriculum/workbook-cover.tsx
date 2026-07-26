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
