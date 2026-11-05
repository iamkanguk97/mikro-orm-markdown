---
title: 스키마 정의 엔티티
description: EntitySchema와 defineEntity() 선언에 작성한 JSDoc을 읽는 방식입니다.
---

[`EntitySchema`](https://mikro-orm.io/docs/entity-schema) — 또는 그 위에 만들어진 MikroORM 7의 `defineEntity()` — 로 정의한 엔티티는 export된 스키마 선언에서 JSDoc을 읽습니다. 설명과 모든 [JSDoc 태그](/mikro-orm-markdown/ko/reference/jsdoc-tags/)가 동일하게 동작합니다:

```ts
/**
 * Blog post declared without a decorator class.
 * @namespace Blog
 */
export const PostSchema = new EntitySchema({
  name: 'Post',
  properties: {
    id: { primary: true, type: 'integer' },
    /** Post title */
    title: { type: 'string' },
  },
});
```

- **이름만 있는 스키마**(위 예시처럼 `class:` 연결이 없는 경우)는 `properties` 객체 리터럴 안의 프로퍼티 JSDoc도 읽습니다 — MikroORM 7의 `properties: (p) => ({...})` 빌더 콜백도 지원합니다. 컬럼 표에서는 이 JSDoc이 `comment` 옵션보다 우선하며, `comment`는 폴백으로 유지됩니다.
- **클래스 연결 스키마**(`class:`)는 프로퍼티 JSDoc을 클래스에서 읽습니다. 엔티티 레벨 JSDoc은 필드별로 병합되며 충돌 시 클래스가 우선하고, `@hidden`은 두 위치 중 한 곳에만 있어도 적용됩니다.
- 스키마 선언을 읽지 못한 엔티티(스캔한 소스에서 찾지 못함, 모호함, 주석이 제거된 컴파일된 JavaScript에서만 발견됨)는 경고로 이름이 알려지므로, 그곳에 적힌 `@hidden`이 조용히 사라지는 일은 없습니다.
