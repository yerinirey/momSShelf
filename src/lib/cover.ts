import type { CoverConfig, BookType } from "./types";

// 색상 팔레트 — 깊고 채도 낮은 고전 책 표지 톤
const NOVEL_PALETTES = [
  { spine: "#7a1f1f", accent: "#d4a544", text: "#f4ede0" }, // crimson · gold
  { spine: "#1f3a5f", accent: "#c9b27c", text: "#f4ede0" }, // navy · sand
  { spine: "#2d4a2b", accent: "#d4a544", text: "#f4ede0" }, // forest · gold
  { spine: "#4a2c5a", accent: "#e0c891", text: "#f4ede0" }, // plum · cream
  { spine: "#6b3410", accent: "#e8c598", text: "#f4ede0" }, // umber · wheat
  { spine: "#2c2c2c", accent: "#b8860b", text: "#f4ede0" }, // charcoal · brass
  { spine: "#8b3a3a", accent: "#f0d8a0", text: "#f4ede0" }, // brick · cream
  { spine: "#1a3a3a", accent: "#c4a574", text: "#f4ede0" }, // teal · tan
];

const MOVIE_PALETTES = [
  { spine: "#0f0f1a", accent: "#d4a544", text: "#f4ede0" }, // noir · gold
  { spine: "#3a1a1a", accent: "#e8b04a", text: "#f4ede0" }, // dark crimson · amber
  { spine: "#1a2a3a", accent: "#c9a86b", text: "#f4ede0" }, // midnight · brass
  { spine: "#2a1a2a", accent: "#d4a544", text: "#f4ede0" }, // velvet · gold
  { spine: "#1a1a1a", accent: "#a87248", text: "#f4ede0" }, // pitch · copper
  { spine: "#2a3a1a", accent: "#d4c574", text: "#f4ede0" }, // olive · straw
];

const PATTERNS: CoverConfig["pattern"][] = ["plain", "stripes", "dots", "diamond", "wave"];

// 제목을 시드로 결정론적 해시
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateCoverConfig(title: string, type: BookType): CoverConfig {
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
