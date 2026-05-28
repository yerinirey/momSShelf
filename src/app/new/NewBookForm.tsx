"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BookType = "novel" | "movie";
type StageKey =
  | "thinking"
  | "header"
  | "styling"
  | "characters"
  | "relations"
  | "finalizing";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "thinking", label: "작품 분석 및 디자인 컨셉 결정" },
  { key: "header", label: "헤더·타이틀 작성" },
  { key: "styling", label: "분위기 맞춤 디자인 적용" },
  { key: "characters", label: "인물 정보 구성" },
  { key: "relations", label: "관계망 연결" },
  { key: "finalizing", label: "마무리 · 서재에 꽂기" },
];

const ESTIMATED_CHARS = 30_000;

/**
 * 환경에 따라 생성 엔드포인트와 인증 헤더를 반환:
 * - NEXT_PUBLIC_WORKER_URL 설정 (예: https://moms-shelf-worker.onrender.com):
 *   Render에 배포된 워커의 /generate 호출. Vercel 60초 한도 회피.
 * - 그 외 (로컬 개발): Next.js 라우트 /api/generate 사용 (timeout 없음)
 */
async function getGenerateEndpoint(): Promise<{
  url: string;
  headers: Record<string, string>;
}> {
  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL?.trim();
  if (!workerUrl) {
    return { url: "/api/generate", headers: {} };
  }
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("로그인이 필요합니다");
  }
  return {
    url: `${workerUrl.replace(/\/$/, "")}/generate`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

type ServerEvent =
  | { type: "started"; estimated_chars: number }
  | { type: "delta"; received_chars: number }
  | { type: "stage"; stage: StageKey; label: string }
  | { type: "complete"; id: string; title: string }
  | { type: "error"; error: string };

export function NewBookForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<BookType>("novel");
  const [author, setAuthor] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<StageKey>("thinking");
  const [receivedChars, setReceivedChars] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setCurrentStage("thinking");
    setReceivedChars(0);
    const t0 = Date.now();
    setStartedAt(t0);

    const elapsedTimer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 500);

    try {
      const { url, headers } = await getGenerateEndpoint();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          title: title.trim(),
          type,
          author: author.trim() || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        // 409 같이 JSON 에러로 끝난 경우
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `요청 실패 (HTTP ${res.status})`);
        setLoading(false);
        clearInterval(elapsedTimer);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          let event: ServerEvent;
          try {
            event = JSON.parse(json);
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setLoading(false);
    } finally {
      clearInterval(elapsedTimer);
    }

    function handleEvent(ev: ServerEvent) {
      switch (ev.type) {
        case "started":
          setCurrentStage("thinking");
          break;
        case "delta":
          setReceivedChars(ev.received_chars);
          break;
        case "stage":
          setCurrentStage(ev.stage);
          break;
        case "complete":
          setReceivedChars((c) => Math.max(c, ESTIMATED_CHARS));
          setCurrentStage("finalizing");
          // 살짝 텀을 두고 이동 (사용자가 완료 상태를 인지)
          setTimeout(() => {
            router.push(`/book/${ev.id}`);
          }, 600);
          break;
        case "error":
          setError(ev.error);
          setLoading(false);
          break;
      }
    }
  }

  if (loading) {
    return (
      <ProgressView
        currentStage={currentStage}
        receivedChars={receivedChars}
        elapsed={elapsed}
        error={error}
        onCancel={() => {
          setLoading(false);
          setError(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["novel", "movie"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={[
              "flex-1 py-2 rounded font-myeongjo font-bold tracking-tight transition",
              type === t
                ? "bg-ink text-paper"
                : "bg-transparent border border-ink/20 text-ink/60 hover:border-ink/50",
            ].join(" ")}
          >
            {t === "novel" ? "소설" : "영화"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs tracking-[0.2em] text-ink/60 uppercase">
          제목 *
        </label>
        <input
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "movie" ? "예) 기생충" : "예) 채식주의자"}
          className="border border-ink/20 rounded px-3 py-2.5 bg-white/60 focus:outline-none focus:border-crimson"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs tracking-[0.2em] text-ink/60 uppercase">
          {type === "movie" ? "감독" : "작가"}{" "}
          <span className="opacity-50">(선택)</span>
        </label>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={type === "movie" ? "예) 봉준호" : "예) 한강"}
          className="border border-ink/20 rounded px-3 py-2.5 bg-white/60 focus:outline-none focus:border-crimson"
        />
      </div>

      <button
        type="submit"
        disabled={!title.trim()}
        className="bg-crimson text-paper py-3 rounded font-myeongjo font-bold tracking-wide hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        관계도 생성
      </button>

      {error && (
        <div className="p-3 border border-crimson/40 bg-crimson/5 rounded text-xs text-crimson">
          ⚠️ {error}
        </div>
      )}

      <Link
        href="/"
        className="text-xs text-ink/50 text-center mt-2 hover:text-ink"
      >
        ← 책장으로 돌아가기
      </Link>
    </form>
  );
}

// ============ Progress 화면 ============

function ProgressView({
  currentStage,
  receivedChars,
  elapsed,
  error,
  onCancel,
}: {
  currentStage: StageKey;
  receivedChars: number;
  elapsed: number;
  error: string | null;
  onCancel: () => void;
}) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);
  const percentByChars = Math.min(
    95,
    Math.round((receivedChars / ESTIMATED_CHARS) * 100),
  );
  // 단계가 finalizing이면 95% 위로
  const percent =
    currentStage === "finalizing" ? Math.max(percentByChars, 96) : percentByChars;

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <div className="flex justify-between text-[10px] tracking-[0.2em] text-ink/50 uppercase mb-1.5">
          <span className="font-cormorant">In Progress</span>
          <span className="tabular-nums">
            {receivedChars.toLocaleString()}자 · {elapsed}초
          </span>
        </div>
        <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-crimson transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {STAGES.map((s, idx) => {
          const status: "done" | "active" | "pending" =
            idx < currentIdx
              ? "done"
              : idx === currentIdx
                ? "active"
                : "pending";
          return (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <StageIcon status={status} />
              <span
                className={[
                  "transition-colors",
                  status === "done"
                    ? "text-ink/60 line-through decoration-ink/30"
                    : status === "active"
                      ? "text-ink font-myeongjo font-bold"
                      : "text-ink/40",
                ].join(" ")}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>

      {error ? (
        <div className="p-3 border border-crimson/40 bg-crimson/5 rounded text-xs text-crimson">
          ⚠️ {error}
        </div>
      ) : (
        <p className="text-[11px] text-ink/50 text-center leading-relaxed">
          평균 1~3분 소요됩니다. 화면을 닫지 마세요.
          <br />
          작품이 길거나 복잡할수록 더 오래 걸려요.
        </p>
      )}

      {error && (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-ink/60 underline underline-offset-2 hover:text-ink"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

function StageIcon({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <span
        className="w-5 h-5 rounded-full bg-jade flex items-center justify-center text-paper text-[11px] font-bold shrink-0"
        style={{ backgroundColor: "#4a6b52" }}
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        className="w-5 h-5 rounded-full border-2 border-crimson flex items-center justify-center shrink-0"
        aria-hidden
      >
        <span className="w-2 h-2 rounded-full bg-crimson animate-pulse" />
      </span>
    );
  }
  return (
    <span
      className="w-5 h-5 rounded-full border-2 border-ink/15 shrink-0"
      aria-hidden
    />
  );
}
