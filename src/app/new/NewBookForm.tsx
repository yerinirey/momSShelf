"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BookType = "novel" | "movie";
type StageKey =
  | "waking"
  | "thinking"
  | "header"
  | "styling"
  | "characters"
  | "relations"
  | "finalizing";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "waking", label: "생성 서버 준비 (최대 30초)" },
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
  workerOrigin: string | null;
}> {
  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL?.trim();
  if (!workerUrl) {
    return { url: "/api/generate", headers: {}, workerOrigin: null };
  }
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("로그인이 필요합니다");
  }
  const origin = workerUrl.replace(/\/$/, "");
  return {
    url: `${origin}/generate`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    workerOrigin: origin,
  };
}

/**
 * Render 무료 티어는 15분 무사용 후 잠듦.
 * 본 요청 전에 GET /health 로 깨우고, 응답이 오면 정상.
 * 모바일 브라우저의 짧은 fetch timeout 회피.
 */
async function wakeWorker(origin: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    await fetch(`${origin}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

type ServerEvent =
  | { type: "started"; estimated_chars: number }
  | { type: "delta"; received_chars: number }
  | { type: "stage"; stage: StageKey; label: string }
  | { type: "complete"; id: string; title: string }
  | { type: "error"; error: string };

type JobState = {
  status: "running" | "done" | "error";
  stage: StageKey;
  stageLabel: string;
  receivedChars: number;
  totalEstimate: number;
  bookId?: string;
  title?: string;
  error?: string;
};

/**
 * 워커 모드 — 짧은 HTTP 요청만 사용 (모바일 친화):
 *   1. POST /generate → {jobId} 받기
 *   2. GET /jobs/:id 를 1.5초마다 폴링
 *   3. status가 done/error일 때까지 반복
 */
async function runPollingFlow({
  workerOrigin,
  url,
  headers,
  body,
  onStage,
  onChars,
  onComplete,
  onError,
}: {
  workerOrigin: string;
  url: string;
  headers: Record<string, string>;
  body: { title: string; type: "novel" | "movie"; author?: string };
  onStage: (s: StageKey) => void;
  onChars: (n: number) => void;
  onComplete: (bookId: string) => void;
  onError: (msg: string) => void;
}): Promise<void> {
  // 1) 시작
  const startRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!startRes.ok) {
    const data = await startRes.json().catch(() => null);
    onError(data?.error ?? `요청 실패 (HTTP ${startRes.status})`);
    return;
  }
  const { jobId } = (await startRes.json()) as { jobId: string };

  // 2) 폴링
  const pollUrl = `${workerOrigin}/jobs/${jobId}`;
  const maxDuration = 5 * 60 * 1000; // 5분 안전 한도
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxDuration) {
    await new Promise((r) => setTimeout(r, 1500));

    const pollRes = await fetch(pollUrl, { headers, cache: "no-store" });
    if (!pollRes.ok) {
      onError(`폴링 실패 (HTTP ${pollRes.status})`);
      return;
    }
    const state = (await pollRes.json()) as JobState;

    onStage(state.stage);
    onChars(state.receivedChars);

    if (state.status === "done" && state.bookId) {
      onComplete(state.bookId);
      return;
    }
    if (state.status === "error") {
      onError(state.error ?? "생성 실패");
      return;
    }
  }

  onError("시간 초과 (5분). 잠시 후 다시 시도해주세요.");
}

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
    setCurrentStage("waking");
    setReceivedChars(0);
    const t0 = Date.now();
    setStartedAt(t0);

    const elapsedTimer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 500);

    try {
      const { url, headers, workerOrigin } = await getGenerateEndpoint();

      if (workerOrigin) {
        // 워커 모드: 폴링 패턴
        await wakeWorker(workerOrigin).catch(() => {});
        setCurrentStage("thinking");
        await runPollingFlow({
          workerOrigin,
          url,
          headers,
          body: {
            title: title.trim(),
            type,
            author: author.trim() || undefined,
          },
          onStage: setCurrentStage,
          onChars: setReceivedChars,
          onComplete: (bookId) => {
            setReceivedChars(ESTIMATED_CHARS);
            setCurrentStage("finalizing");
            setTimeout(() => router.push(`/book/${bookId}`), 600);
          },
          onError: (msg) => {
            setError(msg);
            setLoading(false);
          },
        });
      } else {
        // 로컬 모드: SSE 스트림 직접 읽기
        setCurrentStage("thinking");
        await runSseFlow(url, headers, {
          title: title.trim(),
          type,
          author: author.trim() || undefined,
        });
      }
    } catch (e) {
      const err = e as Error;
      const details = [
        err.message,
        err.name && err.name !== "Error" ? `(${err.name})` : "",
        `UA: ${navigator.userAgent.slice(0, 80)}`,
      ]
        .filter(Boolean)
        .join(" · ");
      setError(details);
      setLoading(false);
    } finally {
      clearInterval(elapsedTimer);
    }

    async function runSseFlow(
      url: string,
      headers: Record<string, string>,
      body: { title: string; type: BookType; author?: string },
    ) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `요청 실패 (HTTP ${res.status})`);
        setLoading(false);
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
