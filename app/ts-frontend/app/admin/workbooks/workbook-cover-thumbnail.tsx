"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function WorkbookCoverThumbnail({ title, thumbnailUrl }: { title: string; thumbnailUrl: string | null }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [thumbnailUrl]);

  if (!thumbnailUrl || failed) {
    return (
      <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#a9835c]" fill="none" aria-label="Workbook cover not ready yet" role="img">
        <path d="M10 8.5A4.5 4.5 0 0 1 14.5 4H38v34H14.5A4.5 4.5 0 0 0 10 42.5v-34Z" fill="currentColor" opacity=".18" />
        <path d="M10 8.5A4.5 4.5 0 0 1 14.5 4H38v34H14.5A4.5 4.5 0 0 0 10 42.5m0-34v34m0 0A4.5 4.5 0 0 1 14.5 38H38M16 12h15M16 18h11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return <Image src={thumbnailUrl} alt={`${title} cover`} fill unoptimized className="object-cover" onError={() => setFailed(true)} />;
}
