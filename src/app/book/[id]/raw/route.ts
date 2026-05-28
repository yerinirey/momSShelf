import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: book } = await supabase
    .from("books")
    .select("html_path")
    .eq("id", id)
    .maybeSingle();

  if (!book?.html_path) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("books")
    .download(book.html_path);

  if (error || !data) {
    return new NextResponse(`Storage error: ${error?.message ?? "missing"}`, {
      status: 404,
    });
  }

  const html = await data.text();

  const csp = [
    "default-src 'self' data:",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://d3js.org",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
  ].join("; ");

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
