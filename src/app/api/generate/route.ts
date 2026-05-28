import { NextRequest } from "next/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBaseTemplate } from "@/lib/template";
import { generateCoverConfig } from "@/lib/cover";
import type { BookType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro 5분; Hobby에서는 60초로 클램프됨

type GenerateBody = {
  title: string;
  type: BookType;
  author?: string;
};

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

// ============ 단계 감지 마커 ============
type Stage = "thinking" | "header" | "styling" | "characters" | "relations" | "finalizing";

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

// ============ POST 핸들러 ============
export async function POST(req: NextRequest) {
  // 인증
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const allowed =
    process.env.ALLOWED_EMAILS?.split(",").map((s) => s.trim()) ?? [];
  if (!user?.email || !allowed.includes(user.email)) {
    return new Response("권한 없음", { status: 403 });
  }

  // body 검증
  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return new Response("잘못된 요청", { status: 400 });
  }
  const title = body.title?.trim();
  const type = body.type;
  const author = body.author?.trim() || null;
  if (!title || (type !== "novel" && type !== "movie")) {
    return new Response("title과 type 필수", { status: 400 });
  }

  // 중복 체크
  const { data: dup } = await supabase
    .from("books")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  if (dup) {
    return new Response(
      JSON.stringify({ error: "이미 같은 제목의 책이 있어요", existingId: dup.id }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  // SSE 스트림 시작
  const encoder = new TextEncoder();
  const userId = user.id;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const close = () => {
        try {
          controller.close();
        } catch {}
      };

      try {
        send({ type: "started", estimated_chars: 30000 });

        // Claude 스트리밍 호출
        const template = getBaseTemplate();
        const systemBlocks = [
          {
            type: "text" as const,
            text: SYSTEM_PROMPT.replace("{{TEMPLATE_HTML}}", template),
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
            send({ type: "stage", stage, label: STAGE_LABELS[stage] });
          }
          // 200ms 또는 1KB마다 한 번씩 progress 송신 (과도한 이벤트 방지)
          const now = Date.now();
          if (now - lastSent > 250 || html.length - charsAtLastSend > 1024) {
            send({ type: "delta", received_chars: html.length });
            lastSent = now;
            charsAtLastSend = html.length;
          }
        });

        await aStream.finalMessage();

        // 최종 progress 한 번 더
        send({ type: "delta", received_chars: html.length });
        send({
          type: "stage",
          stage: "finalizing",
          label: STAGE_LABELS.finalizing,
        });

        const trimmed = html.trim();
        if (
          !trimmed.startsWith("<!DOCTYPE html>") &&
          !trimmed.startsWith("<!doctype html>")
        ) {
          send({
            type: "error",
            error: "유효한 HTML이 생성되지 않았어요. 다시 시도해보세요.",
          });
          close();
          return;
        }

        // DB + Storage
        send({ type: "stage", stage: "finalizing", label: "서재에 꽂는 중" });

        const admin = createSupabaseAdminClient();
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
          send({
            type: "error",
            error: `DB 저장 실패: ${insErr?.message ?? "unknown"}`,
          });
          close();
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
          send({ type: "error", error: `Storage 업로드 실패: ${upErr.message}` });
          close();
          return;
        }

        await admin
          .from("books")
          .update({ html_path: htmlPath })
          .eq("id", row.id);

        send({ type: "complete", id: row.id, title });
        close();
      } catch (e) {
        console.error("생성 실패:", e);
        send({
          type: "error",
          error: e instanceof Error ? e.message : "알 수 없는 오류",
        });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx/프록시 버퍼링 방지
    },
  });
}
