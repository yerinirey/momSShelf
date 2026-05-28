import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Bookshelf } from "@/components/Bookshelf";
import { TabFilter } from "@/components/TabFilter";
import type { Book } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ type?: string }>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { type } = await searchParams;
  const tab = type === "novel" || type === "movie" ? type : "all";

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("books").select("*").order("created_at", { ascending: true });
  if (tab !== "all") query = query.eq("type", tab);

  const { data, error } = await query;
  const books: Book[] = error ? [] : (data as Book[]);

  return (
    <main className="flex-1 flex flex-col items-center px-4 sm:px-8 py-10 sm:py-14">
      <header className="text-center mb-10">
        <div className="inline-block mb-3">
          <span
            className="inline-block w-12 h-12 leading-[44px] text-center border-2 rounded-md font-myeongjo font-extrabold text-sm"
            style={{
              borderColor: "var(--crimson)",
              color: "var(--crimson)",
              transform: "rotate(-4deg)",
              letterSpacing: "-1px",
            }}
          >
            書齋
          </span>
        </div>
        <h1 className="font-myeongjo font-extrabold text-4xl sm:text-5xl tracking-tight text-ink">
          엄마만의 서재
        </h1>
        <p className="mt-3 text-xs sm:text-sm font-cormorant tracking-[0.4em] uppercase text-crimson">
          Mom&apos;s Private Library
        </p>
        <p className="mt-4 text-sm text-ink/60 max-w-md mx-auto leading-relaxed">
          엄마가 읽은 소설과 본 영화의 인물 관계도를 모아둔 서재.
          책 하나를 골라 펼치면 그 안의 사람들을 만날 수 있어요.
        </p>
      </header>

      <div className="w-full max-w-5xl">
        <TabFilter current={tab} />
        {error ? (
          <ErrorView message={error.message} />
        ) : (
          <Bookshelf books={books} />
        )}
        {books.length === 0 && !error && <EmptyHint />}
      </div>

      <footer className="mt-12 text-[10px] tracking-[0.3em] text-ink/40 font-cormorant uppercase">
        Curated with Claude · 2026
      </footer>
    </main>
  );
}

function EmptyHint() {
  return (
    <p className="text-center mt-6 text-sm text-ink/50 italic">
      아직 책장이 비어있어요. 오른쪽 끝의 <span className="font-bold">+</span> 를 눌러 첫 책을 더해보세요.
    </p>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="p-6 rounded-md border border-crimson/40 bg-crimson/5 text-sm text-crimson">
      <strong className="font-bold">데이터를 불러오지 못했어요.</strong>
      <br />
      <span className="opacity-80">{message}</span>
    </div>
  );
}
