---
title: 컴파일된 JavaScript 빌드
description: 컴파일된 .js 엔티티를 discovery하는 config에서 --src를 언제, 어떻게 쓰는지 설명합니다.
---

MikroORM config가 `entities: ['./dist/**/*.js']`처럼 컴파일된 `.js` 파일에서 엔티티를 discovery한다면, 엔티티 구조는 여전히 찾을 수 있지만 JSDoc 주석은 빌드 과정에서 제거되었을 수 있습니다.

이 경우 설명과 `@namespace`, `@hidden` 같은 태그를 해당 `.js` 파일에서 읽을 수 없습니다.

이 경우에만 `--src`를 사용하세요:

```bash
mikro-orm-markdown \
  --config ./dist/mikro-orm.config.js \
  --src "src/**/*.entity.ts"
```

`--src`가 어떤 파일과도 매칭되지 않거나 발견된 엔티티 선언을 빠뜨리면, 불완전한 문서를 조용히 생성하는 대신 실패합니다.

:::tip
가능하면 `.ts` config를 사용하고 `entitiesTs`가 소스 파일을 가리키게 하세요. 그러면 JSDoc을 원본 TypeScript에서 읽으므로 `--src`가 필요하지 않습니다.
:::
