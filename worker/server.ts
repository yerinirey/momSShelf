/**
 * 엄마만의 서재 · 생성 워커
 *
 * Render에 배포되어 /generate POST 한 엔드포인트만 처리.
 * Vercel(60s) / Supabase Edge(150s) 한도를 회피하기 위함.
 *
 * 환경변수:
 *  - SUPABASE_URL
 *  - SUPABASE_ANON_KEY
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - ANTHROPIC_API_KEY
 *  - ALLOWED_EMAILS (쉼표 구분)
 *  - PORT (Render가 자동 주입)
 *  - ALLOWED_ORIGINS (선택, 쉼표 구분 — 기본 *)
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============ 상수 ============
const CLAUDE_MODEL = "claude-sonnet-4-6";
const ESTIMATED_OUTPUT_CHARS = 30_000;

const TEMPLATE_HTML = readFileSync(
  join(__dirname, "base-template.html"),
  "utf-8",
);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ============ 단계 감지 ============
type Stage =
  | "thinking"
  | "header"
  | "styling"
  | "characters"
  | "relations"
  | "finalizing";

const STAGE_LABELS: Record<Stage, string> = {
  thinking: "작품 분석 및 디자인 컨셉 결정",
  header: "헤더·타이틀 작성",
  styling: "분위기 맞춤 디자인 적용",
  characters: "인물 정보 구성",
  relations: "관계망 연결",
  finalizing: "마무리",
};

function detectStage(html: string, currentStage: Stage): Stage {
  if (currentStage === "thinking" && html.includes("<header>")) return "header";
  if (currentStage === "header" && html.includes("<style>")) return "styling";
  if (currentStage === "styling" && html.includes("const characters"))
    return "characters";
  if (currentStage === "characters" && html.includes("const relations"))
    return "relations";
  if (currentStage === "relations" && html.includes("simulation.on"))
    return "finalizing";
  return currentStage;
}

// ============ 표지 자동 생성 ============
const NOVEL_PALETTES = [
  { spine: "#7a1f1f", accent: "#d4a544", text: "#f4ede0" },
  { spine: "#1f3a5f", accent: "#c9b27c", text: "#f4ede0" },
  { spine: "#2d4a2b", accent: "#d4a544", text: "#f4ede0" },
  { spine: "#4a2c5a", accent: "#e0c891", text: "#f4ede0" },
  { spine: "#6b3410", accent: "#e8c598", text: "#f4ede0" },
  { spine: "#2c2c2c", accent: "#b8860b", text: "#f4ede0" },
  { spine: "#8b3a3a", accent: "#f0d8a0", text: "#f4ede0" },
  { spine: "#1a3a3a", accent: "#c4a574", text: "#f4ede0" },
];
const MOVIE_PALETTES = [
  { spine: "#0f0f1a", accent: "#d4a544", text: "#f4ede0" },
  { spine: "#3a1a1a", accent: "#e8b04a", text: "#f4ede0" },
  { spine: "#1a2a3a", accent: "#c9a86b", text: "#f4ede0" },
  { spine: "#2a1a2a", accent: "#d4a544", text: "#f4ede0" },
  { spine: "#1a1a1a", accent: "#a87248", text: "#f4ede0" },
  { spine: "#2a3a1a", accent: "#d4c574", text: "#f4ede0" },
];
const PATTERNS = ["plain", "stripes", "dots", "diamond", "wave"] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generateCoverConfig(title: string, type: "novel" | "movie") {
  const h = hash(title);
  const palettes = type === "movie" ? MOVIE_PALETTES : NOVEL_PALETTES;
  const palette = palettes[h % palettes.length];
  const pattern = PATTERNS[(h >> 8) % PATTERNS.length];
  return {
    spineColor: palette.spine,
    accentColor: palette.accent,
    textColor: palette.text,
    pattern,
  };
}

// ============ 시스템 프롬프트 ============
const SYSTEM_PROMPT = `당신은 한국 소설/영화의 인물 관계도 HTML을 만드는 시각 디자이너입니다.

아래 <TEMPLATE>은 D3.js force-simulation으로 동작하는 작동하는 인물 관계도입니다.
당신의 임무는 이 템플릿을 새 작품에 맞춰 **시각적으로 재해석**하면서, 시각화 동작 자체는 그대로 유지하는 것입니다.

## 자유롭게 변경하세요 — 작품의 분위기에 맞춰 디자인하세요

- 색상 팔레트 (CSS \`:root\`의 모든 색상 변수)
- 폰트 (\`<link href="https://fonts.googleapis.com/...">\` 자유 선택)
- 배경 패턴/텍스처 (\`body\`와 \`body::before\`)
- 헤더의 stamp(한자 2자) 자체와 그 주위 장식
- 헤더/푸터 타이포그래피와 장식 요소
- 추가 장식 SVG 요소 (별, 먹의 번짐, 입자, 한지 텍스처 등) — 단 그래프 영역과 겹치지 않게 배치
- \`factionColors\` 와 \`linkColors\`의 **색상 값** (단 키 이름은 유지: protag/loyal/antag/minor, loyal/hostile/blood/blood-hostile/neutral)

### 작품 톤별 디자인 예시 (반드시 따를 필요는 없음 — 영감으로)
- **우주·신화·SF** (예: 베르베르 『신』): 깊은 남색·자색 배경, 황금별 입자, Cinzel·EB Garamond
- **사극·역사**: 한지색, 먹빛, Nanum Myeongjo, 도장·인장 모티프
- **현대 한국문학**: 절제된 회색조, 깊이 있는 단색, Noto Serif KR
- **호러·미스터리**: 어두운 적/검정, 거친 노이즈 텍스처, 음각 느낌
- **로맨스·따뜻한 일상**: 파스텔, 부드러운 그라데이션, 둥근 폰트
- **느와르·범죄**: 흑백 + 단일 강조색, 영화 프레임 느낌

## 절대 변경 금지 — 깨지면 시각화가 작동 안 함

- D3 force simulation 코드 (forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY 호출과 파라미터)
- 모든 이벤트 핸들러 (dragStarted/dragged/dragEnded, click, tick)
- DOM ID: \`#graph\`, \`#detailPanel\`, \`#detailContent\`, \`#hint\`
- JS에서 참조하는 클래스명: \`.node\`, \`.node-circle\`, \`.node-label\`, \`.node-sublabel\`, \`.link\`, \`.link-label\`, \`.dimmed\`, \`.selected\`, \`.node-ring\`
- 그래프 렌더 코드 블록 (nodeG/linkPath/linkLabels 생성·tick 핸들러)
- \`factionColors\`, \`linkColors\` 객체의 **키 이름** (값은 변경 OK)
- 컨테이너 구조: \`.container > header, .layout > .sidebar + main > .graph-container > svg#graph\`

## 내용 교체

1. \`<title>\` — "작품명 · 인물 관계도"
2. \`<header>\`: stamp 한자(작품 톤에 맞춰), h1, subtitle-en, meta spans (감독/작가, 연도, 배경 등)
3. \`<p class="description">\` — 작품을 한 줄로 소개
4. \`<footer>\` 내용 — 제목·작가/감독·주연/주요인물·연도
5. \`characters\` 배열 — 6~12명. 각 인물:
   - \`id\`: 영문 camelCase
   - \`name\`, \`hanja\` (가능하면)
   - \`role\`: 역할 한줄 설명
   - \`actor\`: 배우(영화) 또는 "(작가의 분신)" 같은 묘사(소설)
   - \`faction\`: "protag" | "loyal" | "antag" | "minor"
   - \`importance\`: 30~100 (주인공 100)
   - \`description\`: 2~4문장
   - \`death\` (선택): 운명/최후
   - \`note\` (선택): 부재나 특이사항
6. \`relations\` 배열 — 관계:
   - \`source\`, \`target\`: characters의 id
   - \`type\`: "loyal" | "hostile" | "blood" | "blood-hostile" | "neutral"
   - \`strength\`: 1~10
   - \`label\`: 관계의 성격 (예: "사제", "복수의 대상", "운명적 사랑")

## 출력 형식

- \`<!DOCTYPE html>\`로 시작
- 마크다운/코드블록/설명 일절 없이 완전한 HTML 한 덩어리만
- 줄바꿈·들여쓰기는 자유

<TEMPLATE>
{{TEMPLATE_HTML}}
</TEMPLATE>`;

// ============ 앱 ============
const app = new Hono();

app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGINS.includes("*") ? "*" : ALLOWED_ORIGINS,
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["authorization", "content-type", "apikey"],
    maxAge: 86400,
  }),
);

app.get("/", (c) =>
  c.json({ name: "moms-shelf-worker", ok: true, model: CLAUDE_MODEL }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.post("/generate", async (c) => {
  const SUPABASE_URL = required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_ANON_KEY = required(
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
  const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
  const ANTHROPIC_API_KEY = required("ANTHROPIC_API_KEY");
  const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 인증
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Authorization 헤더 없음" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user?.email || !ALLOWED_EMAILS.includes(user.email)) {
    return c.json({ error: "권한 없음" }, 403);
  }

  // body
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "잘못된 요청" }, 400);
  const title = body.title?.trim();
  const type = body.type as "novel" | "movie";
  const author = body.author?.trim() || null;
  if (!title || (type !== "novel" && type !== "movie")) {
    return c.json({ error: "title과 type 필수" }, 400);
  }

  // 중복 체크
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
  const { data: dup } = await admin
    .from("books")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  if (dup) {
    return c.json(
      { error: "이미 같은 제목의 책이 있어요", existingId: dup.id },
      409,
    );
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const userId = user.id;

  return streamSSE(c, async (stream) => {
    const send = (event: object) =>
      stream.writeSSE({ data: JSON.stringify(event) });

    try {
      await send({ type: "started", estimated_chars: ESTIMATED_OUTPUT_CHARS });

      const systemBlocks = [
        {
          type: "text" as const,
          text: SYSTEM_PROMPT.replace("{{TEMPLATE_HTML}}", TEMPLATE_HTML),
          cache_control: { type: "ephemeral" as const },
        },
      ];

      const userMsg = [
        `작품 제목: ${title}`,
        `종류: ${type === "movie" ? "영화" : "소설"}`,
        author ? `${type === "movie" ? "감독" : "작가"}: ${author}` : null,
        "",
        "위 작품의 인물 관계도 HTML을 만들어주세요.",
        "작품의 분위기·톤·시대 배경에 맞는 색상·폰트·배경 디자인을 적용하세요.",
        "당신의 지식 안에서 정확한 인물·관계 정보를 채우고, 알 수 없는 부분은 합리적으로 생략하세요.",
      ]
        .filter(Boolean)
        .join("\n");

      const aStream = anthropic.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: systemBlocks,
        messages: [{ role: "user", content: userMsg }],
      });

      let html = "";
      let stage: Stage = "thinking";
      let lastSent = Date.now();
      let charsAtLastSend = 0;

      aStream.on("text", (text: string) => {
        html += text;
        const newStage = detectStage(html, stage);
        if (newStage !== stage) {
          stage = newStage;
          void send({ type: "stage", stage, label: STAGE_LABELS[stage] });
        }
        const now = Date.now();
        if (now - lastSent > 250 || html.length - charsAtLastSend > 1024) {
          void send({ type: "delta", received_chars: html.length });
          lastSent = now;
          charsAtLastSend = html.length;
        }
      });

      await aStream.finalMessage();

      await send({ type: "delta", received_chars: html.length });
      await send({
        type: "stage",
        stage: "finalizing",
        label: STAGE_LABELS.finalizing,
      });

      const trimmed = html.trim();
      if (
        !trimmed.startsWith("<!DOCTYPE html>") &&
        !trimmed.startsWith("<!doctype html>")
      ) {
        await send({
          type: "error",
          error: "유효한 HTML이 생성되지 않았어요. 다시 시도해보세요.",
        });
        return;
      }

      await send({
        type: "stage",
        stage: "finalizing",
        label: "서재에 꽂는 중",
      });

      const cover = generateCoverConfig(title, type);
      const year = new Date().getFullYear();

      const { data: row, error: insErr } = await admin
        .from("books")
        .insert({
          title,
          type,
          author,
          year,
          cover_config: cover,
          summary: null,
          html_path: "pending",
          owner_id: userId,
        })
        .select("id")
        .single();

      if (insErr || !row) {
        await send({
          type: "error",
          error: `DB 저장 실패: ${insErr?.message ?? "unknown"}`,
        });
        return;
      }

      const htmlPath = `books/${row.id}.html`;
      const { error: upErr } = await admin.storage
        .from("books")
        .upload(htmlPath, trimmed, {
          contentType: "text/html; charset=utf-8",
          upsert: true,
        });

      if (upErr) {
        await admin.from("books").delete().eq("id", row.id);
        await send({
          type: "error",
          error: `Storage 업로드 실패: ${upErr.message}`,
        });
        return;
      }

      await admin
        .from("books")
        .update({ html_path: htmlPath })
        .eq("id", row.id);

      await send({ type: "complete", id: row.id, title });
    } catch (e) {
      console.error("생성 실패:", e);
      await send({
        type: "error",
        error: e instanceof Error ? e.message : "알 수 없는 오류",
      });
    }
  });
});

function required(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(`환경변수 ${names.join(" 또는 ")} 누락`);
}

const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`✨ moms-shelf-worker listening on http://localhost:${info.port}`);
});
