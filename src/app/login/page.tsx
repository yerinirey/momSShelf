import { signInWithKakao } from "./actions";

type SearchParams = Promise<{ redirect?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { redirect, error } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <header className="text-center mb-10">
          <div
            className="inline-block w-12 h-12 leading-[44px] text-center border-2 rounded-md font-myeongjo font-extrabold text-sm mb-3"
            style={{
              borderColor: "var(--crimson)",
              color: "var(--crimson)",
              transform: "rotate(-4deg)",
            }}
          >
            入室
          </div>
          <h1 className="font-myeongjo font-extrabold text-3xl tracking-tight">
            로그인
          </h1>
          <p className="mt-2 text-xs font-cormorant tracking-[0.3em] uppercase text-crimson">
            Sign in to add a book
          </p>
        </header>

        <form action={signInWithKakao} className="flex flex-col gap-4">
          {redirect && <input type="hidden" name="redirect" value={redirect} />}

          <button
            type="submit"
            className="flex items-center justify-center gap-3 py-3.5 rounded-md font-myeongjo font-bold tracking-tight transition hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "#FEE500", color: "#191919" }}
          >
            <KakaoIcon />
            카카오로 시작하기
          </button>

          {error && (
            <div className="p-3 border border-crimson/40 bg-crimson/5 rounded text-xs text-crimson">
              ⚠️ {error}
            </div>
          )}

          <p className="text-[11px] text-ink/50 leading-relaxed mt-3 text-center">
            화이트리스트에 등록된 이메일만 책을 추가할 수 있어요.
            <br />
            그 외에는 책장을 구경만 할 수 있습니다.
          </p>
        </form>
      </div>
    </main>
  );
}

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.85 1.86 5.34 4.66 6.78l-1.18 4.32c-.1.36.29.65.6.45l5.18-3.42c.24.02.49.03.74.03 5.52 0 10-3.58 10-8 0-4.42-4.48-8-10-8z" />
    </svg>
  );
}
