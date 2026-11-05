---
title: CLI 옵션
description: mikro-orm-markdown의 모든 커맨드라인 옵션입니다.
---

```bash
mikro-orm-markdown --config ./mikro-orm.config.ts [options]
```

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `-c, --config <path>` | _(필수)_ | MikroORM 설정 파일 경로 |
| `-o, --out <path>` | `./ERD.md` | 출력 Markdown 파일 경로 |
| `-t, --title <string>` | `Database Schema` | 문서 H1 제목 |
| `-d, --description <string>` | — | 제목 아래에 표시할 설명 문단 (선택) |
| `--tsconfig <path>` | — | `.ts` config 로드 시 사용할 `tsconfig.json`; 기본값은 config 파일 근처의 가장 가까운 파일 |
| `--src <paths...>` | — | 원본 TypeScript 엔티티 소스 경로/glob; MikroORM이 컴파일된 JavaScript에서 엔티티를 discovery할 때만 필요. [컴파일된 JavaScript 빌드](/mikro-orm-markdown/ko/guides/compiled-js/) 참고. |
| `--exclude-columns <names...>` | — | 모든 엔티티에서 생략할 DB 컬럼 이름. [컬럼 제외](/mikro-orm-markdown/ko/guides/exclude-columns/) 참고. |
| `--mermaid-layout <layout>` | — | Mermaid 레이아웃 엔진 (`dagre` \| `elk` \| `elk.stress`). 생략하면 뷰어 기본값 사용. |
| `--mermaid-theme <theme>` | — | Mermaid 테마 (`default` \| `neutral` \| `dark` \| `forest` \| `base`). 생략하면 뷰어 기본값 사용. |

:::tip
설명이 길거나 여러 줄이라면 CLI 대신 [프로그래밍 API](/mikro-orm-markdown/ko/reference/api/)를 사용하세요 — 쉘 인용 부호 제약 없이 문자열을 그대로 전달할 수 있습니다.
:::

## Config 파일 요구사항

config 파일은 일반 설정 객체를 **default export** 해야 합니다:

```ts
export default defineConfig({ ... }); // ✅
export const config = defineConfig({ ... }); // ❌ named export not supported
export default async () => defineConfig({ ... }); // ❌ functions/Promises not supported
```

config를 비동기적으로 만들어야 한다면 [프로그래밍 API](/mikro-orm-markdown/ko/reference/api/)를 사용하세요.
