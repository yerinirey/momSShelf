import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Book } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function BookDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const book = data as Book;

  // 우리 도메인을 통해 프록시 — Supabase Storage의 CSP를 우회하고 동일 출처 유지
  const htmlUrl = `/book/${book.id}/raw`;

  return (
    <main className="flex-1 flex flex-col px-4 sm:px-8 py-6">
      <nav className="max-w-6xl w-full mx-auto mb-4 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-ink/60 hover:text-ink"
        >
          ← 서재로
        </Link>
        <div className="text-right">
          <div className="font-myeongjo font-bold text-lg">{book.title}</div>
          <div className="text-[10px] tracking-[0.2em] text-ink/50 uppercase font-cormorant">
            {book.type === "movie" ? "Cinema" : "Novel"}
            {book.author ? ` · ${book.author}` : ""}
            {book.year ? ` · ${book.year}` : ""}
          </div>
        </div>
      </nav>

      <div className="max-w-6xl w-full mx-auto flex-1 border border-ink/15 rounded-md overflow-hidden bg-white shadow-sm">
        <iframe
          src={htmlUrl}
          title={book.title}
          className="w-full h-full"
          style={{ minHeight: "calc(100vh - 140px)" }}
          sandbox="allow-scripts"
        />
      </div>
    </main>
  );
}
