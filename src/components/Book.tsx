import Link from "next/link";
import type { Book as BookT } from "@/lib/types";
import { generateCoverConfig } from "@/lib/cover";

const patternClass = {
  plain: "",
  stripes: "pattern-stripes",
  dots: "pattern-dots",
  diamond: "pattern-diamond",
  wave: "pattern-wave",
} as const;

export function Book({ book }: { book: BookT }) {
  const cfg = book.cover_config ?? generateCoverConfig(book.title, book.type);

  return (
    <Link
      href={`/book/${book.id}`}
      className="book-3d block"
      title={`${book.title}${book.author ? ` · ${book.author}` : ""}`}
    >
      <div
        className={`book-cover ${patternClass[cfg.pattern]} flex flex-col items-center justify-between rounded-r-[2px] rounded-l-[1px]`}
        style={{
          width: "120px",
          height: "172px",
          backgroundColor: cfg.spineColor,
          color: cfg.textColor,
          padding: "16px 12px 12px 16px",
        }}
      >
        <div className="book-pages" />

        {/* Top accent line */}
        <div
          className="w-full h-px opacity-70"
          style={{ backgroundColor: cfg.accentColor }}
        />

        {/* Title */}
        <div className="flex-1 flex items-center justify-center w-full">
          <div
            className="font-myeongjo font-bold text-center leading-tight"
            style={{
              fontSize: titleFontSize(book.title),
              letterSpacing: "-0.02em",
              wordBreak: "keep-all",
              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          >
            {book.title}
          </div>
        </div>

        {/* Type pill + author */}
        <div className="w-full flex flex-col items-center gap-1.5">
          <div
            className="h-px w-8 opacity-60"
            style={{ backgroundColor: cfg.accentColor }}
          />
          {book.author && (
            <div
              className="text-[8.5px] text-center opacity-80 font-serif-kr"
              style={{ letterSpacing: "0.05em" }}
            >
              {book.author}
            </div>
          )}
          <div
            className="text-[7px] font-cormorant uppercase tracking-[0.3em]"
            style={{ color: cfg.accentColor }}
          >
            {book.type === "movie" ? "Cinema" : "Novel"}
          </div>
        </div>
      </div>
    </Link>
  );
}

function titleFontSize(title: string): string {
  const len = title.length;
  if (len <= 4) return "22px";
  if (len <= 7) return "18px";
  if (len <= 11) return "15px";
  if (len <= 16) return "12.5px";
  return "11px";
}
