---
title: 설치 및 요구사항
description: mikro-orm-markdown을 설치하고 프로젝트에 필요한 조건을 확인합니다.
---

## 설치

```bash
npm install -D mikro-orm-markdown
# or
pnpm add -D mikro-orm-markdown
```

## 요구사항

- **Node.js >= 22.17**
- **MikroORM 6 또는 7** — `@mikro-orm/core`는 peer dependency이며 범위는 `>=6.0.0 <8`입니다.
- **MikroORM config 파일** — CLI는 plain MikroORM options object를 default export로 내보내는 파일을 기대합니다.
- **사용할 DB에 맞는 MikroORM 드라이버 패키지** — 예를 들어 `@mikro-orm/postgresql`, `@mikro-orm/mysql`, `@mikro-orm/mariadb`, `@mikro-orm/sqlite`가 있습니다. 실행 중인 DB 연결은 필요 없지만, MikroORM이 메타데이터를 discovery하려면 드라이버는 필요합니다.
- **데코레이터 또는 스키마 정의 엔티티** — `@Entity()` 클래스는 클래스에서 JSDoc을 읽습니다. `EntitySchema`(또는 그 위에 만들어진 MikroORM 7의 `defineEntity()`)로 정의한 엔티티도 동일하게 렌더링되며, export된 스키마 선언에서 JSDoc을 읽습니다 — [스키마 정의 엔티티](/mikro-orm-markdown/ko/guides/schema-entities/)를 참고하세요.
- **MikroORM 7에서는 데코레이터를 `@mikro-orm/decorators`에서 임포트** — v7은 데코레이터를 `@mikro-orm/core`에서 분리해 `@mikro-orm/decorators/legacy`(TypeScript `experimentalDecorators`)와 `@mikro-orm/decorators/es`(ES 표준 데코레이터)로 옮겼습니다. 둘 다 이 도구와 함께 동작합니다. v6에서는 그대로 `@mikro-orm/core`에 있습니다.
- **해석 가능한 프로퍼티 타입** — 각 엔티티 프로퍼티의 타입은 MikroORM discovery 시점에 알려져야 합니다. `type:` / `entity:` 같은 명시적인 데코레이터 옵션을 사용하거나, `@mikro-orm/reflection`을 설치해 CLI가 TypeScript 소스에 대해 `TsMorphMetadataProvider`를 자동으로 사용하게 하세요.
- **TypeScript config 파일을 위한 `tsx`** — CLI에서 `.ts` MikroORM config를 로드할 때만 필요합니다. `.js` config 파일에는 필요하지 않습니다.

:::caution
`@mikro-orm/reflection`을 설치한다면 **`@mikro-orm/core`와 정확히 같은 버전**으로 맞추세요. MikroORM은 공식 `@mikro-orm/*` 패키지들이 하나의 버전을 공유한다고 기대하며, 버전이 다르면 discovery가 실패할 수 있습니다.
:::

## Agent Skill (선택)

Claude Code 등 Agent Skills 호환 도구를 쓴다면 [`skills/mikro-orm-markdown/`](https://github.com/iamkanguk97/mikro-orm-markdown/tree/main/skills/mikro-orm-markdown)의 선택적 Agent Skill로 이 도구를 설정하고 문제를 진단할 수 있습니다. npm 패키지에는 포함되지 않습니다.
