import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const errParam = url.searchParams.get("error_description");

  // 매직링크 만료/에러는 supabase 쪽에서 쿼리로 돌려보냄
  if (errParam) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errParam)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  // redirect 응답을 미리 만들어두고 쿠키를 직접 첨부
  const response = NextResponse.redirect(new URL(next, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return response;
}
