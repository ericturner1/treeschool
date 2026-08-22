"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, ReactNode } from "react";
import type { BlogCategory, BlogPost } from "../../../../lib/blog/server";
import {
  generateBlogDraftAction,
  saveBlogPostAction,
  unpublishBlogPostAction,
} from "../actions";
import { DeleteBlogPostButton } from "./delete-blog-post-button";

/**
 * Mirrors the server allowlist in ts-backend/src/services/blog.ts (sanitizeBlogHtml).
 * Keep the two in sync: anything the editor keeps but the server strips will silently
 * disappear on save, which is exactly the paste-then-save mismatch this guards against.
 */
const EDITOR_ALLOWED_TAGS = new Set([
  "P", "H2", "H3", "H4", "UL", "OL", "LI", "STRONG", "EM", "A",
  "BLOCKQUOTE", "CODE", "PRE", "HR", "BR", "FIGURE", "FIGCAPTION", "IMG", "SPAN",
]);

const BLOG_FONT_OPTIONS = [
  { label: "Page default", marker: "treeschool-default", className: "blog-font-default" },
  { label: "Treeschool Sans", marker: "treeschool-sans", className: "blog-font-sans" },
  { label: "Comic Neue", marker: "treeschool-comic", className: "blog-font-comic" },
  { label: "Georgia", marker: "treeschool-georgia", className: "blog-font-georgia" },
  { label: "Arial", marker: "treeschool-arial", className: "blog-font-arial" },
  { label: "Verdana", marker: "treeschool-verdana", className: "blog-font-verdana" },
  { label: "Times New Roman", marker: "treeschool-times", className: "blog-font-times" },
] as const;

const BLOG_FONT_CLASSES = new Set<string>(BLOG_FONT_OPTIONS.map((option) => option.className));
const DEFAULT_BLOG_FONT_SIZE_PX = 17.25;
const DEFAULT_BLOG_LINE_HEIGHT = 1.85;

/**
 * h1 -> h2 because the article template already renders the post title as the page's
 * only <h1>. The server unwraps b/i entirely, so promote them to their semantic
 * equivalents before they reach it.
 */
const EDITOR_TAG_REMAP: Record<string, string> = {
  H1: "H2",
  B: "STRONG",
  I: "EM",
};

const EDITOR_KEEP_ATTRS: Record<string, string[]> = {
  A: ["href", "title", "target", "rel"],
  IMG: ["src", "alt", "title", "width", "height", "loading"],
  SPAN: ["class"],
};

/**
 * Reduces clipboard HTML to the same shape the server will accept, so that what the
 * editor displays after a paste is what actually gets stored. Browsers put heavily
 * inline-styled markup on the clipboard when copying rendered pages; without this the
 * editor renders that pasted CSS and the styling vanishes on the next save.
 */
export function normalizePastedHtml(dirty: string): string {
  const doc = new DOMParser().parseFromString(dirty, "text/html");

  const clean = (parent: Node) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }

      const element = child as Element;
      clean(element); // depth-first, so children are settled before the parent moves

      const mapped = EDITOR_TAG_REMAP[element.tagName] ?? element.tagName;

      if (!EDITOR_ALLOWED_TAGS.has(mapped)) {
        element.replaceWith(...element.childNodes); // unwrap, keep the text
        continue;
      }

      let target = element;
      if (mapped !== element.tagName) {
        target = doc.createElement(mapped.toLowerCase());
        while (element.firstChild) target.appendChild(element.firstChild);
        element.replaceWith(target);
      }

      const keep = EDITOR_KEEP_ATTRS[target.tagName] ?? [];
      for (const attribute of [...target.attributes]) {
        if (!keep.includes(attribute.name)) target.removeAttribute(attribute.name);
      }

      if (target.tagName === "SPAN") {
        const fontClass = [...target.classList].find((className) => BLOG_FONT_CLASSES.has(className));
        if (!fontClass) {
          target.replaceWith(...target.childNodes);
          continue;
        }
        target.setAttribute("class", fontClass);
      }
    }
  };

  clean(doc.body);
  return doc.body.innerHTML;
}

function ToolbarButton({
  label,
  title,
  onClick,
  disabled = false,
}: {
  label: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-[#d8c7ad] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f4ecdf] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {label}
    </button>
  );
}

function BulletedListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="4" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="15" r="1" fill="currentColor" stroke="none" />
      <path d="M8 5h8M8 10h8M8 15h8" />
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 3.5h1v4M3.5 7.5h2M3.4 11.4c.3-.5.8-.8 1.3-.8.8 0 1.3.5 1.3 1.1 0 1.1-2.6 1.7-2.6 3.2H6M9 5h7M9 10h7M9 15h7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.2 12.8 6.8 14.2a3 3 0 0 1-4.2-4.2l2.3-2.3a3 3 0 0 1 4.2 0M11.8 7.2l1.4-1.4a3 3 0 1 1 4.2 4.2l-2.3 2.3a3 3 0 0 1-4.2 0M7.2 12.8l5.6-5.6" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3" width="15" height="14" rx="2" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="m4.5 15 4-4 2.5 2.5 1.8-1.8 2.7 3.3" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7 6-3 3 3 3" />
      <path d="M4 9h7a5 5 0 0 1 5 5v1" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m13 6 3 3-3 3" />
      <path d="M16 9H9a5 5 0 0 0-5 5v1" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7 5-5 5 5 5M13 5l5 5-5 5M11.5 3 8.5 17" />
    </svg>
  );
}

async function uploadError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error || fallback;
}

async function uploadBlogImage(postId: string, file: File) {
  const contentType = file.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error("Blog images may be up to 10 MB.");
  }
  const prepareResponse = await fetch("/api/blog/images/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, contentType, sizeBytes: file.size }),
  });
  if (!prepareResponse.ok)
    throw new Error(
      await uploadError(prepareResponse, "Could not prepare the image upload."),
    );
  const prepared = (await prepareResponse.json()) as {
    objectPath: string;
    uploadUrl: string;
    contentType: string;
  };
  try {
    const uploadResponse = await fetch(prepared.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": prepared.contentType },
      body: file,
    });
    if (!uploadResponse.ok)
      throw new Error("The image could not be uploaded to storage.");
    const completeResponse = await fetch("/api/blog/images/upload", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, objectPath: prepared.objectPath }),
    });
    if (!completeResponse.ok)
      throw new Error(
        await uploadError(
          completeResponse,
          "Could not verify the uploaded image.",
        ),
      );
    return (await completeResponse.json()) as {
      objectPath: string;
      publicUrl: string;
    };
  } catch (error) {
    await fetch("/api/blog/images/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, objectPath: prepared.objectPath }),
    }).catch(() => undefined);
    throw error;
  }
}

function BlogFeaturedImageField({
  postId,
  initialUrl,
}: {
  postId: string;
  initialUrl: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialUrl ?? "");
  const [uploadedObjectPath, setUploadedObjectPath] = useState<string | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discardUpload = async (objectPath: string) => {
    await fetch("/api/blog/images/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, objectPath }),
    }).catch(() => undefined);
  };

  const upload = async (file: File) => {
    if (uploading) return;
    setError(null);
    setUploading(true);
    try {
      const completed = await uploadBlogImage(postId, file);
      if (uploadedObjectPath && uploadedObjectPath !== completed.objectPath)
        await discardUpload(uploadedObjectPath);
      setUploadedObjectPath(completed.objectPath);
      setImageUrl(completed.publicUrl);
    } catch (uploadFailure) {
      setError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : "Could not upload the image.",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = async () => {
    const stagedPath = uploadedObjectPath;
    setImageUrl("");
    setUploadedObjectPath(null);
    setError(null);
    if (stagedPath) await discardUpload(stagedPath);
  };

  return (
    <div>
      <input type="hidden" name="featuredImageUrl" value={imageUrl} readOnly />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-disabled={uploading}
        aria-busy={uploading}
        onClick={() => {
          if (!uploading) fileInputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (!uploading && ["Enter", " "].includes(event.key)) {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file && !uploading) void upload(file);
        }}
        className={`group relative flex min-h-[230px] cursor-pointer items-center justify-center overflow-hidden rounded-[20px] border-2 border-dashed transition ${dragging ? "border-[#6f994f] bg-[#eef5e4]" : "border-[#cdb996] bg-white hover:border-[#7fa460] hover:bg-[#fbfdf8]"} ${uploading ? "cursor-wait opacity-80" : ""}`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Current featured image preview"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="px-6 text-center">
            <span
              aria-hidden="true"
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf2e1] text-2xl text-[#567b40]"
            >
              ↑
            </span>
            <p className="mt-4 font-semibold">Drop a featured image here</p>
            <p className="mt-1 text-sm text-ink/52">
              or click to choose a file
            </p>
          </div>
        )}
        {imageUrl && !uploading ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/55 px-4 py-3 text-center text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
            Click to replace image
          </div>
        ) : null}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-3 bg-[#fffaf2]/90 font-semibold">
            <span className="activity-spinner" aria-hidden="true" /> Uploading
            image…
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-ink/50">
          JPEG, PNG, or WebP · up to 10 MB · stored in the{" "}
          <strong>blog-images</strong> library.
        </p>
        {imageUrl ? (
          <button
            type="button"
            onClick={() => void removeImage()}
            disabled={uploading}
            className="text-sm font-semibold text-[#8b3e2f] underline underline-offset-4 disabled:opacity-50"
          >
            Remove image
          </button>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[12px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BlogEditor({
  post,
  availableCategories,
}: {
  post: BlogPost;
  availableCategories: BlogCategory[];
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const initializedRevisionRef = useRef<number | null>(null);
  const [title, setTitle] = useState(post.revision.title);
  const [excerpt, setExcerpt] = useState(post.revision.excerpt);
  const [seoTitle, setSeoTitle] = useState(post.revision.seoTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    post.revision.metaDescription ?? "",
  );
  const [editorMode, setEditorMode] = useState<"visual" | "source">("visual");
  const [sourceHtml, setSourceHtml] = useState(post.revision.contentHtml);
  const [bodyFontSizePx, setBodyFontSizePx] = useState<number | null>(
    post.revision.bodyFontSizePx,
  );
  const [bodyLineHeight, setBodyLineHeight] = useState<number | null>(
    post.revision.bodyLineHeight,
  );
  const [uploadingInlineImage, setUploadingInlineImage] = useState(false);
  const [inlineImageError, setInlineImageError] = useState<string | null>(null);
  const selectedCategories = useMemo(
    () => new Set(post.categories.map((category) => category.name)),
    [post.categories],
  );

  const syncEditorHtml = () => {
    if (htmlInputRef.current)
      htmlInputRef.current.value = editorRef.current?.innerHTML ?? "";
  };

  const restoreEditorSelection = () => {
    const range = savedSelectionRef.current;
    const editor = editorRef.current;
    if (!range || !editor || !editor.contains(range.commonAncestorContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const attachEditor = useCallback(
    (node: HTMLDivElement | null) => {
      editorRef.current = node;
      if (
        node &&
        initializedRevisionRef.current !== post.revision.revisionNumber
      ) {
        node.innerHTML = post.revision.contentHtml;
        initializedRevisionRef.current = post.revision.revisionNumber;
        if (htmlInputRef.current)
          htmlInputRef.current.value = post.revision.contentHtml;
      }
    },
    [post.revision.contentHtml, post.revision.revisionNumber],
  );

  const command = (name: string, value?: string) => {
    editorRef.current?.focus();
    restoreEditorSelection();
    document.execCommand(name, false, value);
    syncEditorHtml();
    rememberEditorSelection();
  };

  const applyFont = (marker: string) => {
    const option = BLOG_FONT_OPTIONS.find((candidate) => candidate.marker === marker);
    const editor = editorRef.current;
    if (!option || !editor) return;
    editor.focus();
    restoreEditorSelection();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontName", false, option.marker);
    for (const font of editor.querySelectorAll("font[face]")) {
      const matched = BLOG_FONT_OPTIONS.find((candidate) => candidate.marker === font.getAttribute("face"));
      if (!matched) continue;
      const span = document.createElement("span");
      span.className = matched.className;
      span.replaceChildren(...font.childNodes);
      font.replaceWith(span);
    }
    syncEditorHtml();
    rememberEditorSelection();
  };

  const toggleSourceMode = () => {
    if (editorMode === "visual") {
      const currentHtml = editorRef.current?.innerHTML ?? "";
      setSourceHtml(currentHtml);
      if (htmlInputRef.current) htmlInputRef.current.value = currentHtml;
      setEditorMode("source");
      return;
    }

    const cleanHtml = normalizePastedHtml(sourceHtml);
    if (editorRef.current) editorRef.current.innerHTML = cleanHtml;
    if (htmlInputRef.current) htmlInputRef.current.value = cleanHtml;
    setSourceHtml(cleanHtml);
    setEditorMode("visual");
    requestAnimationFrame(() => editorRef.current?.focus());
  };
  const addLink = () => {
    const href = window.prompt("Paste an internal path or a complete URL");
    if (href) command("createLink", href);
  };
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const html = event.clipboardData.getData("text/html");
    if (!html) return; // plain-text pastes carry no markup to clean
    event.preventDefault();
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, normalizePastedHtml(html));
    syncEditorHtml();
    rememberEditorSelection();
  };
  const rememberEditorSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current) return;
    const range = selection.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer))
      savedSelectionRef.current = range.cloneRange();
  };
  const chooseInlineImage = () => {
    rememberEditorSelection();
    setInlineImageError(null);
    inlineImageInputRef.current?.click();
  };
  const insertInlineImage = (publicUrl: string, alt: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = publicUrl;
    image.alt = alt;
    image.loading = "lazy";
    figure.appendChild(image);
    const nextParagraph = document.createElement("p");
    nextParagraph.appendChild(document.createElement("br"));
    const range = savedSelectionRef.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(figure);
      figure.after(nextParagraph);
    } else {
      editor.append(figure, nextParagraph);
    }
    const caret = document.createRange();
    caret.selectNodeContents(nextParagraph);
    caret.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
    savedSelectionRef.current = caret.cloneRange();
    editor.focus();
    syncEditorHtml();
  };
  const uploadInlineImage = async (file: File) => {
    if (uploadingInlineImage) return;
    setUploadingInlineImage(true);
    setInlineImageError(null);
    const filenameDescription = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim();
    const alt =
      window.prompt(
        "Briefly describe this image for readers using assistive technology.",
        filenameDescription,
      ) ?? filenameDescription;
    try {
      const completed = await uploadBlogImage(post.id, file);
      insertInlineImage(completed.publicUrl, alt.trim());
    } catch (uploadFailure) {
      setInlineImageError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : "Could not upload the image.",
      );
    } finally {
      setUploadingInlineImage(false);
      if (inlineImageInputRef.current) inlineImageInputRef.current.value = "";
    }
  };
  const slugPreview = post.slug || "article-slug";
  const searchTitle = seoTitle || title || "Article title";
  const searchDescription =
    metaDescription || excerpt || "Your article description will appear here.";
  const submitBlogPost = async (formData: FormData) => {
    const contentHtml = editorMode === "source"
      ? normalizePastedHtml(sourceHtml)
      : editorRef.current?.innerHTML ?? "";
    formData.set("contentHtml", contentHtml);
    await saveBlogPostAction(formData);
  };

  return (
    <div className="space-y-7">
      <form action={submitBlogPost} className="space-y-7">
        <input type="hidden" name="postId" value={post.id} />
        <input
          ref={htmlInputRef}
          type="hidden"
          name="contentHtml"
          defaultValue={post.revision.contentHtml}
        />
        <input
          type="hidden"
          name="bodyFontSizePx"
          value={bodyFontSizePx ?? ""}
        />
        <input
          type="hidden"
          name="bodyLineHeight"
          value={bodyLineHeight ?? ""}
        />
        <section className="rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-7">
          <div className="grid gap-5">
            <label className="grid gap-2 text-sm font-semibold">
              Title
              <input
                name="title"
                required
                maxLength={180}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-h-14 rounded-[15px] border border-[#d7c3a3] bg-white px-4 text-lg font-semibold"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <label className="grid gap-2 text-sm font-semibold">
                URL slug
                <div className="flex min-h-14 items-center rounded-[15px] border border-[#d7c3a3] bg-white px-4">
                  <span className="text-ink/38">/blog/</span>
                  <input
                    name="slug"
                    required
                    defaultValue={post.slug}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </div>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Language
                <select
                  name="languageCode"
                  defaultValue={post.languageCode}
                  disabled
                  className="min-h-14 rounded-[15px] border border-[#d7c3a3] bg-[#f6f0e6] px-4 pr-10"
                >
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <label className="grid gap-2 text-sm font-semibold">
              Excerpt{" "}
              <span className="text-xs font-normal text-ink/48">
                Used on the blog index and social previews.
              </span>
              <textarea
                name="excerpt"
                maxLength={500}
                rows={3}
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                className="rounded-[15px] border border-[#d7c3a3] bg-white px-4 py-3 leading-7"
              />
            </label>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#dcc8aa] bg-white">
          <input
            ref={inlineImageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadInlineImage(file);
            }}
          />
          <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-t-[27px] border-b border-[#e5d7c1] bg-[#f7efe3]/95 px-4 py-3 shadow-[0_8px_20px_rgba(67,50,34,.1)] backdrop-blur-md">
            <select
              aria-label="Text style"
              defaultValue="p"
              disabled={editorMode === "source"}
              onMouseDown={rememberEditorSelection}
              onChange={(event) => command("formatBlock", event.target.value)}
              className="rounded-[9px] border border-[#d8c7ad] bg-white px-3 py-2 pr-9 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="p">Paragraph</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="blockquote">Quote</option>
            </select>
            <select
              aria-label="Font family"
              defaultValue=""
              disabled={editorMode === "source"}
              onMouseDown={rememberEditorSelection}
              onChange={(event) => {
                if (event.target.value) applyFont(event.target.value);
                event.currentTarget.value = "";
              }}
              className="rounded-[9px] border border-[#d8c7ad] bg-white px-3 py-2 pr-9 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="" disabled>Font</option>
              {BLOG_FONT_OPTIONS.map((option) => <option key={option.marker} value={option.marker}>{option.label}</option>)}
            </select>
            <ToolbarButton
              label="B"
              title="Bold"
              onClick={() => command("bold")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <span aria-hidden="true" className="font-serif text-lg italic">
                  I
                </span>
              }
              title="Italic"
              onClick={() => command("italic")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <BulletedListIcon /> Bullets
                </>
              }
              title="Bulleted list"
              onClick={() => command("insertUnorderedList")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <NumberedListIcon /> Numbered
                </>
              }
              title="Numbered list"
              onClick={() => command("insertOrderedList")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <LinkIcon /> Link
                </>
              }
              title="Add link"
              onClick={addLink}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                uploadingInlineImage ? (
                  <>
                    <span className="activity-spinner" aria-hidden="true" />{" "}
                    Uploading…
                  </>
                ) : (
                  <>
                    <ImageIcon /> Image
                  </>
                )
              }
              title="Upload and insert image"
              onClick={chooseInlineImage}
              disabled={uploadingInlineImage || editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <UndoIcon /> Undo
                </>
              }
              title="Undo"
              onClick={() => command("undo")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <RedoIcon /> Redo
                </>
              }
              title="Redo"
              onClick={() => command("redo")}
              disabled={editorMode === "source"}
            />
            <span className="min-w-0 flex-1" aria-hidden="true" />
            <ToolbarButton
              label={<><CodeIcon /> {editorMode === "visual" ? "HTML" : "Visual"}</>}
              title={editorMode === "visual" ? "Edit HTML source" : "Return to visual editor"}
              onClick={toggleSourceMode}
            />
            <details className="group relative">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[9px] border border-[#d8c7ad] bg-white px-3 py-2 text-sm font-semibold marker:hidden hover:bg-[#fbf7ef]">
                Reading
                <span className="text-xs font-normal text-ink/48">
                  {bodyFontSizePx ?? DEFAULT_BLOG_FONT_SIZE_PX}px · {bodyLineHeight ?? DEFAULT_BLOG_LINE_HEIGHT}
                </span>
              </summary>
              <div className="absolute right-0 top-[calc(100%+.55rem)] z-50 w-[min(320px,calc(100vw-2rem))] rounded-[16px] border border-[#d8c7ad] bg-[#fffdf8] p-4 shadow-[0_14px_36px_rgba(67,50,34,.2)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold">Article typography</p>
                    <p className="mt-1 text-xs leading-5 text-ink/50">
                      Applies to the full article body in the editor, preview, and published page.
                    </p>
                  </div>
                  {bodyFontSizePx !== null || bodyLineHeight !== null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBodyFontSizePx(null);
                        setBodyLineHeight(null);
                      }}
                      className="shrink-0 text-xs font-semibold text-[#567b40] underline underline-offset-4"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                <label className="mt-4 grid gap-2 text-xs font-semibold">
                  <span className="flex items-center justify-between gap-3">
                    Font size
                    <output>{bodyFontSizePx ?? DEFAULT_BLOG_FONT_SIZE_PX}px</output>
                  </span>
                  <input
                    type="range"
                    min="14"
                    max="24"
                    step="0.25"
                    value={bodyFontSizePx ?? DEFAULT_BLOG_FONT_SIZE_PX}
                    onChange={(event) => setBodyFontSizePx(Number(event.target.value))}
                    className="w-full accent-[#6f994f]"
                  />
                </label>
                <label className="mt-4 grid gap-2 text-xs font-semibold">
                  <span className="flex items-center justify-between gap-3">
                    Line height
                    <output>{bodyLineHeight ?? DEFAULT_BLOG_LINE_HEIGHT}</output>
                  </span>
                  <input
                    type="range"
                    min="1.35"
                    max="2.25"
                    step="0.05"
                    value={bodyLineHeight ?? DEFAULT_BLOG_LINE_HEIGHT}
                    onChange={(event) => setBodyLineHeight(Number(event.target.value))}
                    className="w-full accent-[#6f994f]"
                  />
                </label>
                {bodyFontSizePx === null && bodyLineHeight === null ? (
                  <p className="mt-3 text-xs font-medium text-[#567b40]">
                    Using the site defaults. Move either slider to customize this revision.
                  </p>
                ) : null}
              </div>
            </details>
          </div>
          {inlineImageError ? (
            <p
              role="alert"
              className="border-b border-[#efc9bc] bg-[#fff1ec] px-5 py-3 text-sm font-semibold text-[#8b3e2f]"
            >
              {inlineImageError}
            </p>
          ) : null}
          <div
            ref={attachEditor}
            contentEditable
            suppressContentEditableWarning
            onPaste={handlePaste}
            onInput={() => {
              syncEditorHtml();
              rememberEditorSelection();
            }}
            onKeyUp={rememberEditorSelection}
            onMouseUp={rememberEditorSelection}
            role="textbox"
            aria-label="Article body"
            aria-multiline="true"
            style={{
              fontSize: bodyFontSizePx ? `${bodyFontSizePx}px` : undefined,
              lineHeight: bodyLineHeight ?? undefined,
            }}
            className={`blog-editor min-h-[560px] px-6 py-7 text-[18px] leading-8 outline-none sm:px-10 sm:py-10 ${editorMode === "source" ? "hidden" : ""}`}
          />
          {editorMode === "source" ? (
            <div className="grid gap-3 px-5 py-5 sm:px-7 sm:py-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[.11em] text-[#567b40]">HTML source</p>
                <p className="text-xs text-ink/48">Unsupported tags and attributes are removed when you return to Visual mode or save.</p>
              </div>
              <textarea
                aria-label="Article HTML source"
                value={sourceHtml}
                onChange={(event) => {
                  setSourceHtml(event.target.value);
                  if (htmlInputRef.current) htmlInputRef.current.value = event.target.value;
                }}
                spellCheck={false}
                className="min-h-[560px] w-full resize-y rounded-[16px] border border-[#cdb996] bg-[#20261d] p-5 font-mono text-[14px] leading-6 text-[#f6f2e9] outline-none focus:border-[#7fa460] focus:ring-4 focus:ring-[#7fa460]/15"
              />
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">
              Organization
            </h2>
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">Categories</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {availableCategories.map((category) => (
                  <label
                    key={category.slug}
                    className="flex items-center gap-2 rounded-[12px] border border-[#e3d4bd] bg-white px-3 py-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="categories"
                      value={category.name}
                      defaultChecked={selectedCategories.has(category.name)}
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-5 grid gap-2 text-sm font-semibold">
              Tags{" "}
              <span className="text-xs font-normal text-ink/48">
                Comma separated
              </span>
              <input
                name="tags"
                defaultValue={post.tags.map((tag) => tag.name).join(", ")}
                className="min-h-12 rounded-[14px] border border-[#d7c3a3] bg-white px-4"
              />
            </label>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[14px] border border-[#d7c3a3] bg-white px-4 py-4">
              <input
                type="checkbox"
                name="showAuthor"
                defaultChecked={post.revision.showAuthor}
                className="mt-1 h-4 w-4 accent-[#6f994f]"
              />
              <span>
                <strong className="block text-sm">Show author</strong>
                <span className="mt-1 block text-xs leading-5 text-ink/50">
                  Display the author’s byline above the published article.
                </span>
              </span>
            </label>
            <label className="mt-5 grid gap-2 text-sm font-semibold">
              Primary search phrase
              <input
                name="primaryKeyword"
                defaultValue={post.revision.primaryKeyword ?? ""}
                maxLength={120}
                className="min-h-12 rounded-[14px] border border-[#d7c3a3] bg-white px-4"
              />
            </label>
          </div>
          <div className="rounded-[28px] border border-[#c5d7b2] bg-[#f1f7e9] p-5 sm:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">
              Search appearance
            </h2>
            <div className="mt-5 rounded-[17px] border border-[#d7dfcd] bg-white px-4 py-4">
              <p className="truncate text-lg text-[#1a0dab]">{searchTitle}</p>
              <p className="mt-1 text-sm text-[#188038]">
                www.treehomeschool.com › blog › {slugPreview}
              </p>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#4d5156]">
                {searchDescription}
              </p>
            </div>
            <label className="mt-5 grid gap-2 text-sm font-semibold">
              SEO title{" "}
              <span
                className={`text-xs font-normal ${seoTitle.length > 60 ? "text-[#9a4a35]" : "text-ink/48"}`}
              >
                {seoTitle.length}/70 characters
              </span>
              <input
                name="seoTitle"
                maxLength={70}
                value={seoTitle}
                onChange={(event) => setSeoTitle(event.target.value)}
                className="min-h-12 rounded-[14px] border border-[#c5d7b2] bg-white px-4"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Meta description{" "}
              <span
                className={`text-xs font-normal ${metaDescription.length > 160 ? "text-[#9a4a35]" : "text-ink/48"}`}
              >
                {metaDescription.length}/170 characters
              </span>
              <textarea
                name="metaDescription"
                maxLength={170}
                rows={3}
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                className="rounded-[14px] border border-[#c5d7b2] bg-white px-4 py-3"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Canonical URL{" "}
              <span className="text-xs font-normal text-ink/48">
                Leave blank unless this content’s primary URL is elsewhere.
              </span>
              <input
                name="canonicalUrl"
                type="url"
                defaultValue={post.revision.canonicalUrl ?? ""}
                className="min-h-12 rounded-[14px] border border-[#c5d7b2] bg-white px-4"
              />
            </label>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-7">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">
            Social and featured image
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/55">
            This image appears on the blog, in link previews, and when the
            article is shared.
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <BlogFeaturedImageField
              postId={post.id}
              initialUrl={post.revision.featuredImageUrl}
            />
            <label className="grid content-start gap-2 text-sm font-semibold">
              Image alt text{" "}
              <span className="text-xs font-normal leading-5 text-ink/48">
                Briefly describe the image for readers who use assistive
                technology.
              </span>
              <textarea
                name="featuredImageAlt"
                defaultValue={post.revision.featuredImageAlt ?? ""}
                maxLength={180}
                rows={5}
                className="rounded-[14px] border border-[#d7c3a3] bg-white px-4 py-3 leading-6"
              />
            </label>
          </div>
        </section>

        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#c5b18f] bg-[#fffaf2]/95 p-3 shadow-[0_12px_36px_rgba(73,52,34,0.18)] backdrop-blur">
          <div className="px-2 text-xs text-ink/50">
            Saving creates revision {post.revision.revisionNumber + 1}.
            Published content changes only when you explicitly publish.
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/admin/blog/${post.id}/preview`}
              className="cta-button cta-button--outline cta-button--small"
            >
              Preview saved version
            </a>
            <button
              type="submit"
              name="intent"
              value="save"
              className="cta-button cta-button--outline cta-button--small"
            >
              Save draft
            </button>
            <button
              type="submit"
              name="intent"
              value="publish"
              className="cta-button cta-button--light cta-button--small"
            >
              Publish now
            </button>
          </div>
        </div>
      </form>

      <details className="rounded-[24px] border border-[#c9c4dc] bg-[#f4f2f8] p-5 sm:p-6">
        <summary className="cursor-pointer text-lg font-semibold">
          AI writing assistant
        </summary>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/58">
          Generate a new editable revision from a fresh brief. The current
          revision remains in history, and nothing publishes automatically.
        </p>
        <form action={generateBlogDraftAction} className="mt-5 grid gap-4">
          <input type="hidden" name="postId" value={post.id} />
          <label className="grid gap-2 text-sm font-semibold">
            What should the next draft accomplish?
            <textarea
              required
              name="topic"
              rows={3}
              maxLength={500}
              defaultValue={post.revision.title}
              className="rounded-[14px] border border-[#c9c4dc] bg-white px-4 py-3"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Audience
              <input
                name="audience"
                defaultValue="Homeschool parents"
                className="min-h-12 rounded-[14px] border border-[#c9c4dc] bg-white px-4"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Primary search phrase
              <input
                name="primaryKeyword"
                defaultValue={post.revision.primaryKeyword ?? ""}
                className="min-h-12 rounded-[14px] border border-[#c9c4dc] bg-white px-4"
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            Editor’s facts and direction
            <textarea
              name="angle"
              rows={3}
              maxLength={600}
              className="rounded-[14px] border border-[#c9c4dc] bg-white px-4 py-3"
            />
          </label>
          <label className="grid max-w-xs gap-2 text-sm font-semibold">
            Depth
            <select
              name="desiredLength"
              defaultValue="standard"
              className="min-h-12 rounded-[14px] border border-[#c9c4dc] bg-white px-4 pr-10"
            >
              <option value="short">Focused</option>
              <option value="standard">Standard</option>
              <option value="deep">In depth</option>
            </select>
          </label>
          <button
            type="submit"
            className="cta-button cta-button--outline justify-self-start"
          >
            Generate a new draft revision
          </button>
        </form>
      </details>

      {post.status === "published" ? (
        <form
          action={unpublishBlogPostAction}
          className="rounded-[22px] border border-[#e0c79c] bg-[#fff7e7] p-5"
        >
          <input type="hidden" name="postId" value={post.id} />
          <h2 className="font-semibold">Publication controls</h2>
          <p className="mt-1 text-sm text-ink/58">
            Unpublishing removes the article from the public blog while
            preserving every revision and its URL history.
          </p>
          <button className="mt-4 text-sm font-semibold text-[#825d2e] underline underline-offset-4">
            Return post to draft
          </button>
        </form>
      ) : null}

      <DeleteBlogPostButton postId={post.id} title={post.revision.title} />
    </div>
  );
}
