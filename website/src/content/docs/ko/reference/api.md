---
title: 프로그래밍 API
description: generateMarkdown()으로 직접 작성한 스크립트에서 문서를 생성합니다.
---

커스텀 빌드 스크립트에 통합하거나 출력 결과를 직접 가공해야 할 때 사용합니다:

```ts
import { writeFile } from 'node:fs/promises';
import { generateMarkdown } from 'mikro-orm-markdown';
import ormConfig from './mikro-orm.config.js';

const markdown = await generateMarkdown({
  orm: ormConfig,
  title: 'My Database',
  description: 'Schema documentation generated from MikroORM metadata.',
});

await writeFile('./ERD.md', markdown, 'utf-8');
```

## 옵션

| 옵션 | 설명 |
| ---- | ---- |
| `orm` | MikroORM options object입니다. 필수입니다. |
| `title` | H1 제목입니다. 기본값은 `Database Schema`입니다. |
| `description` | 제목 아래에 표시할 설명 문단입니다 (선택). CLI flag와 달리 쉘 quoting 제약 없이 문자열을 그대로 전달할 수 있습니다. |
| `src` | 원본 TypeScript 엔티티 소스 경로/glob입니다. `orm.entities`가 컴파일된 JavaScript를 discovery할 때만 필요합니다. |
| `onWarn` | 컴파일된 JavaScript에서 JSDoc을 읽지 못하는 상황 같은 non-fatal warning을 받을 callback입니다. 첫 번째 인자는 항상 일반 문자열 메시지입니다. 두 번째 파라미터를 선언한 callback은 긴 안내형 warning에서 `{ title, detail, impact, fix }` 구조의 객체를 추가로 받으며, `console.warn`처럼 가변 인자 로거를 그대로 전달한 경우에는 문자열만 받습니다. |
| `mermaid` | Mermaid 렌더링 옵션입니다 (선택). [Mermaid 렌더링 옵션](/mikro-orm-markdown/ko/guides/mermaid-options/)을 참고하세요. |
| `excludeColumns` | 모든 엔티티에서 생략할 DB 컬럼 이름 목록입니다 (예: `['created_at', 'updated_at']`). [컬럼 제외](/mikro-orm-markdown/ko/guides/exclude-columns/)를 참고하세요. |

## 비동기 config

MikroORM config를 비동기적으로 만들어야 한다면 직접 resolve한 뒤 결과 options object를 전달하세요:

```ts
const ormConfig = await createOrmConfig();
const markdown = await generateMarkdown({ orm: ormConfig });
```
