/**
 * 기존 seed/ 폴더의 3개 HTML 파일을 Supabase에 등록.
 * 실행: npx tsx scripts/seed.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { generateCoverConfig } from "../src/lib/cover";
import type { BookType } from "../src/lib/types";

config({ path: ".env.local" });

type SeedBook = {
  file: string;
  title: string;
  type: BookType;
  author: string;
  year: number;
  summary: string;
};

const SEED: SeedBook[] = [
  {
    file: "신_인물관계도.html",
    title: "신",
    type: "novel",
    author: "베르나르 베르베르",
    year: 2004,
    summary:
      "죽음 이후, 18명의 인간 후보들이 신들의 학교에 모인다. 자신만의 행성을 다스리며 신이 되어가는 여정.",
  },
  {
    file: "왕과_사는_남자_인물관계도.html",
    title: "왕과 사는 남자",
    type: "movie",
    author: "장항준",
    year: 2026,
    summary:
      "숙부에게 왕위를 빼앗긴 어린 왕 단종과, 영월 광천골 사람들의 마지막 넉 달의 기록.",
  },
  {
    file: "작별하지_않는다_인물관계도.html",
    title: "작별하지 않는다",
    type: "novel",
    author: "한강",
    year: 2021,
    summary:
      "제주 4·3의 기억을 가로지르는 세 여성의 이야기. 폭설과 새, 그리고 살아남은 자의 책무.",
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("환경변수가 비어있습니다. .env.local 확인 필요.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });

  for (const s of SEED) {
    console.log(`\n📚 ${s.title} (${s.type})`);

    // 1) 중복 체크
    const { data: existing } = await supabase
      .from("books")
      .select("id, title")
      .eq("title", s.title)
      .maybeSingle();

    if (existing) {
      console.log(`   ↳ 이미 등록됨 (id=${existing.id}). 건너뜀.`);
      continue;
    }

    // 2) 파일 읽기
    const filePath = join(process.cwd(), "seed", s.file);
    const html = await readFile(filePath, "utf-8");
    console.log(`   ↳ 파일 로드: ${html.length.toLocaleString()} bytes`);

    // 3) row 먼저 만들어 id 확보 (Storage 경로에 id 사용)
    const cover = generateCoverConfig(s.title, s.type);
    const { data: row, error: insErr } = await supabase
      .from("books")
      .insert({
        title: s.title,
        type: s.type,
        author: s.author,
        year: s.year,
        summary: s.summary,
        cover_config: cover,
        html_path: "pending",
        owner_id: null,
      })
      .select("id")
      .single();

    if (insErr || !row) {
      console.error(`   ✗ DB insert 실패:`, insErr);
      continue;
    }

    const htmlPath = `books/${row.id}.html`;

    // 4) Storage 업로드
    const { error: upErr } = await supabase.storage
      .from("books")
      .upload(htmlPath, html, {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });

    if (upErr) {
      console.error(`   ✗ Storage 업로드 실패:`, upErr);
      // 롤백
      await supabase.from("books").delete().eq("id", row.id);
      continue;
    }

    // 5) html_path 업데이트
    await supabase.from("books").update({ html_path: htmlPath }).eq("id", row.id);

    console.log(`   ✓ 완료 (id=${row.id})`);
  }

  console.log("\n✨ 마이그레이션 완료");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
