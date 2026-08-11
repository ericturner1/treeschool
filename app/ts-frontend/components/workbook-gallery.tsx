"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";

export type WorkbookGalleryImage = {
  url: string;
  alt: string;
  label?: string;
};

type WorkbookGalleryProps = {
  title: string;
  cover: WorkbookGalleryImage | null;
  images: WorkbookGalleryImage[];
  caption?: string;
  priority?: boolean;
  fit?: "contain" | "cover";
  sizes?: string;
  thumbnailClassName?: string;
  imageClassName?: string;
  previewEndpoint?: string;
};

export function WorkbookGallery({
  title,
  cover,
  images,
  caption = "",
  priority = false,
  fit = "contain",
  sizes = "(min-width: 1024px) 210px, (min-width: 640px) 26vw, 42vw",
  thumbnailClassName = "aspect-[3/4] rounded-[16px] border border-[#d8c7ad] bg-white shadow-[0_8px_20px_rgba(80,58,39,0.1)]",
  imageClassName = "p-2.5",
  previewEndpoint
}: WorkbookGalleryProps) {
  const dialogTitleId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coverFailed, setCoverFailed] = useState(false);
  const [hoverZoom, setHoverZoom] = useState(false);
  const [clickZoom, setClickZoom] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [loadedImages, setLoadedImages] = useState<WorkbookGalleryImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadAttempted, setLoadAttempted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const galleryImages = useMemo(() => {
    const samples = loadedImages.length > 0 ? loadedImages : images;
    const candidates = [...(cover ? [cover] : []), ...samples];
    return Array.from(new Map(candidates.filter((image) => image.url).map((image) => [image.url, image])).values());
  }, [cover, images, loadedImages]);
  const galleryImageCountRef = useRef(galleryImages.length);
  galleryImageCountRef.current = galleryImages.length;
  const thumbnail = cover ?? galleryImages[0] ?? null;
  const selected = galleryImages[selectedIndex] ?? galleryImages[0] ?? null;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft") {
        setSelectedIndex((current) => (current - 1 + galleryImageCountRef.current) % galleryImageCountRef.current);
        setClickZoom(false);
      }
      if (event.key === "ArrowRight") {
        setSelectedIndex((current) => (current + 1) % galleryImageCountRef.current);
        setClickZoom(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open]);

  async function loadPreviewImages() {
    if (!previewEndpoint || loadAttempted) return;
    setLoadAttempted(true);
    setLoadingImages(true);
    setLoadError(null);
    try {
      const response = await fetch(previewEndpoint);
      if (!response.ok) throw new Error("Sample pages could not be loaded.");
      const payload = await response.json() as {
        previewImages?: Array<{ url?: unknown; label?: unknown }>;
      };
      const next = Array.isArray(payload.previewImages) ? payload.previewImages.flatMap((image) =>
        typeof image.url === "string" && image.url
          ? [{ url: image.url, alt: `${title}: ${String(image.label || "Sample page")}`, label: String(image.label || "Sample page") }]
          : []
      ) : [];
      setLoadedImages(next);
      if (next.length === 0) setLoadError("Sample pages are not available yet.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Sample pages could not be loaded.");
    } finally {
      setLoadingImages(false);
    }
  }

  function show(index: number) {
    setSelectedIndex(index);
    setHoverZoom(false);
    setClickZoom(false);
    setZoomOrigin("50% 50%");
  }

  function move(direction: -1 | 1) {
    show((selectedIndex + direction + galleryImages.length) % galleryImages.length);
  }

  function updateZoomOrigin(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setZoomOrigin(`${x}% ${y}%`);
    setHoverZoom(true);
  }

  const zoomed = hoverZoom || clickZoom;

  return (
    <figure className="grid gap-2">
      <button
        ref={openerRef}
        type="button"
        disabled={!thumbnail || (galleryImages.length === 0 && !previewEndpoint)}
        onClick={() => {
          show(0);
          setOpen(true);
          void loadPreviewImages();
        }}
        aria-haspopup="dialog"
        aria-label={`Open sample pages for ${title}`}
        className={`group relative w-full overflow-hidden text-left transition duration-200 enabled:hover:-translate-y-1 enabled:hover:shadow-[0_14px_28px_rgba(80,58,39,0.18)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#739655]/40 ${thumbnailClassName}`}
      >
        {thumbnail && !coverFailed ? (
          <Image
            src={thumbnail.url}
            alt={thumbnail.alt}
            fill
            priority={priority}
            unoptimized={thumbnail.url.startsWith("http")}
            sizes={sizes}
            className={`${fit === "cover" ? "object-cover" : "object-contain"} ${imageClassName}`}
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-[#fffaf2] p-4 text-center">
            <Image src="/tree-icon.png" alt="" width={70} height={70} className="h-14 w-14 object-contain opacity-70" />
            <span className="absolute bottom-5 text-xs font-bold text-earth">Printable workbook</span>
          </span>
        )}
        {galleryImages.length > 1 || previewEndpoint ? (
          <span className="absolute inset-x-2 bottom-2 translate-y-2 rounded-full bg-[#24311d]/88 px-2 py-1.5 text-center text-[10px] font-bold text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 sm:text-xs">
            View sample pages
          </span>
        ) : null}
      </button>
      {caption ? <figcaption className="text-center text-sm text-current/60">{caption}</figcaption> : null}

      {mounted && open && selected ? createPortal(
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-[#171b14]/82 p-2 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="grid max-h-[96vh] w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[22px] border border-[#d8c7ad] bg-[#fffaf2] shadow-2xl sm:rounded-[28px]"
          >
            <header className="flex items-center gap-3 border-b border-[#e1d3bd] px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[.12em] text-[#557b3f] sm:text-xs">Inside the workbook</p>
                <h2 id={dialogTitleId} className="truncate text-lg font-semibold tracking-[-.02em] sm:text-2xl">{title}</h2>
              </div>
              <p className="hidden text-sm font-semibold text-ink/50 sm:block">{selectedIndex + 1} of {galleryImages.length}</p>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d8c7ad] bg-white text-2xl text-[#78583e] shadow-sm hover:bg-[#f7efe3]" aria-label="Close workbook preview">×</button>
            </header>

            <div className="relative min-h-0 bg-[#ede7dc] p-2 sm:p-5">
              {galleryImages.length > 1 ? (
                <>
                  <button type="button" onClick={() => move(-1)} className="absolute left-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#d8c7ad] bg-white/95 text-2xl text-[#5f4735] shadow-lg hover:bg-white sm:left-7" aria-label="Previous sample page">‹</button>
                  <button type="button" onClick={() => move(1)} className="absolute right-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#d8c7ad] bg-white/95 text-2xl text-[#5f4735] shadow-lg hover:bg-white sm:right-7" aria-label="Next sample page">›</button>
                </>
              ) : null}
              <button
                type="button"
                onPointerMove={updateZoomOrigin}
                onPointerLeave={() => setHoverZoom(false)}
                onClick={() => setClickZoom((current) => !current)}
                className={`relative mx-auto block h-full min-h-[48vh] w-full max-w-4xl overflow-hidden rounded-[14px] bg-white shadow-[0_8px_30px_rgba(45,35,26,.13)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#739655]/40 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
                aria-label={clickZoom ? "Zoom out" : "Zoom in on this sample page"}
              >
                <Image
                  key={selected.url}
                  src={selected.url}
                  alt={selected.alt}
                  fill
                  unoptimized={selected.url.startsWith("http")}
                  sizes="(min-width: 1024px) 896px, 95vw"
                  className="object-contain transition-transform duration-200 ease-out"
                  style={{ transform: zoomed ? "scale(2.15)" : "scale(1)", transformOrigin: zoomOrigin }}
                />
              </button>
              <span className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#24311d]/82 px-3 py-1.5 text-center text-[10px] font-semibold text-white shadow sm:bottom-7 sm:text-xs">
                Hover or click to zoom
              </span>
            </div>

            <footer className="border-t border-[#e1d3bd] px-3 py-3 sm:px-5">
              <p className="mb-2 text-center text-xs font-semibold text-ink/55 sm:text-sm">{loadingImages ? "Preparing sample pages…" : loadError ?? selected.label ?? `Sample page ${selectedIndex + 1}`}</p>
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Workbook sample pages">
                {galleryImages.map((image, index) => (
                  <button
                    key={`${image.url}-${index}`}
                    type="button"
                    onClick={() => show(index)}
                    aria-label={`Show ${image.label || `sample page ${index + 1}`}`}
                    aria-pressed={selectedIndex === index}
                    className={`relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-[8px] border-2 bg-white transition sm:w-20 ${selectedIndex === index ? "border-[#6f944f] ring-2 ring-[#6f944f]/20" : "border-[#dfcfb7] hover:border-[#9eb884]"}`}
                  >
                    <Image src={image.url} alt="" fill unoptimized={image.url.startsWith("http")} sizes="80px" className="object-contain p-1" />
                  </button>
                ))}
              </div>
            </footer>
          </section>
        </div>,
        document.body
      ) : null}
    </figure>
  );
}
