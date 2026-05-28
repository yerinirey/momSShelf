import Link from "next/link";

type Tab = "all" | "novel" | "movie";

const TABS: { key: Tab; label: string; en: string }[] = [
  { key: "all", label: "전체", en: "All" },
  { key: "novel", label: "소설", en: "Novel" },
  { key: "movie", label: "영화", en: "Cinema" },
];

export function TabFilter({ current }: { current: Tab }) {
  return (
    <div className="flex justify-center gap-2 sm:gap-3 mb-8">
      {TABS.map((t) => {
        const active = current === t.key;
        const href = t.key === "all" ? "/" : `/?type=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            className={[
              "px-5 py-2 rounded-full transition-all font-myeongjo",
              "border",
              active
                ? "bg-ink text-paper border-ink"
                : "bg-transparent text-ink/60 border-ink/20 hover:border-ink/50 hover:text-ink",
            ].join(" ")}
          >
            <span className="text-sm font-bold tracking-tight">{t.label}</span>
            <span className="ml-2 text-[10px] font-cormorant tracking-[0.2em] uppercase opacity-60">
              {t.en}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
