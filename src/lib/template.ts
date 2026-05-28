import { readFileSync } from "node:fs";
import { join } from "node:path";

// 모듈 로드 시점에 한 번만 읽어 캐싱
let _template: string | null = null;

export function getBaseTemplate(): string {
  if (_template) return _template;
  const path = join(process.cwd(), "src/templates/base-template.html");
  _template = readFileSync(path, "utf-8");
  return _template;
}
