import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/new") || path.startsWith("/api/generate");

  if (isProtected) {
    const allowed =
      process.env.ALLOWED_EMAILS?.split(",").map((s) => s.trim()) ?? [];
    const isOwner = !!user?.email && allowed.includes(user.email);
    if (!isOwner) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      if (path !== "/login") url.searchParams.set("redirect", path);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
