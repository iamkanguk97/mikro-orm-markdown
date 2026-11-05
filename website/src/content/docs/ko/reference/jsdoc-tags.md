---
title: JSDoc 태그
description: JSDoc 주석으로 설명, 섹션, 노출 여부를 제어합니다.
---

엔티티 클래스 — 또는 export된 스키마 선언, [스키마 정의 엔티티](/mikro-orm-markdown/ko/guides/schema-entities/) 참고 — 에 JSDoc 태그를 추가해 문서의 섹션과 노출 여부를 제어합니다. JSDoc 주석은 TypeScript 엔티티 소스 파일에서 읽습니다.

:::tip[권장 설정]
`.ts` MikroORM config를 사용하고 `entitiesTs`가 소스 엔티티를 가리키게 하세요. 이 설정에서는 JSDoc을 원본 TypeScript 파일에서 읽으므로 `--src`가 필요하지 않습니다.
:::

```ts
/**
 * Blog post authored by a registered user.
 * @namespace Blog
 */
@Entity()
export class Post {
  /** Post title */
  @Property({ type: 'string' })
  title!: string;
}
```

## 설명

태그가 없는 일반 JSDoc 텍스트는 설명이 됩니다. **클래스** 위 텍스트는 엔티티 설명, **프로퍼티** 위 텍스트는 해당 컬럼 설명이 됩니다.

프로퍼티에 JSDoc이 없으면 `@Property({ comment })` 값(DDL 컬럼 코멘트)을 컬럼 설명으로 대신 사용합니다. 마찬가지로 클래스에 JSDoc 설명이 없으면 `@Entity({ comment })` 값(DDL 테이블 코멘트, `EntitySchema`의 경우 `comment`)을 엔티티 설명으로 사용합니다.

## 태그

| 태그                | 설명                                  |
| ------------------- | ------------------------------------- |
| `@namespace <Name>` | `Name` 섹션에 포함 (ERD + 본문 표)    |
| `@erd <Name>`       | `Name` 섹션의 ERD 다이어그램에만 포함 |
| `@describe <Name>`  | `Name` 섹션의 본문 표에만 포함        |
| `@hidden`           | 문서 전체에서 제외                    |
| `@atLeastOne`       | 컬렉션 프로퍼티에 사용: 해당 쪽을 1개 이상으로 렌더링. [관계 카디널리티](/mikro-orm-markdown/ko/guides/cardinality/) 참고. |

태그가 없는 엔티티는 `default` 섹션에 들어갑니다. 하나의 엔티티에 여러 태그를 지정해 여러 섹션에 표시할 수 있습니다.

:::note[NestJS Swagger]
이 다섯 태그는 `mikro-orm-markdown` 전용 커스텀 태그입니다. Swagger는 이를 무시하므로, 엔티티 클래스를 DTO로 함께 쓰더라도 기능 충돌은 없습니다. (다만 Swagger comment introspection을 켰다면 태그 없는 일반 JSDoc 설명은 Swagger 문서에도 표시될 수 있습니다.)
:::
