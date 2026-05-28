import { NewBookForm } from "./NewBookForm";

export const dynamic = "force-dynamic";

export default function NewPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <div
            className="inline-block w-12 h-12 leading-[44px] text-center border-2 rounded-md font-myeongjo font-extrabold text-sm mb-3"
            style={{
              borderColor: "var(--crimson)",
              color: "var(--crimson)",
              transform: "rotate(-4deg)",
            }}
          >
            新刊
          </div>
          <h1 className="font-myeongjo font-extrabold text-3xl tracking-tight">
            새 책 더하기
          </h1>
          <p className="mt-2 text-xs font-cormorant tracking-[0.3em] uppercase text-crimson">
            Add a New Book
          </p>
          <p className="mt-4 text-sm text-ink/60 leading-relaxed">
            제목을 입력하면 Claude가 인물 관계도를 그려 서재에 꽂아둘게요.
            <br />
            <span className="text-[11px] opacity-70">
              약 20~40초 소요
            </span>
          </p>
        </header>

        <NewBookForm />
      </div>
    </main>
  );
}
