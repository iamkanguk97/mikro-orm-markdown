---
title: 관계 카디널리티
description: 관계선의 양 끝이 그려지는 방식과, @atLeastOne으로 컬렉션을 1개 이상으로 올리는 방법입니다.
---

`@atLeastOne`은 TypeScript decorator가 아니라 JSDoc 태그입니다.

컬렉션 관계(`1:N` 또는 `M:N`)는 기본적으로 *0개 이상*으로 렌더링됩니다. 컬렉션 프로퍼티에 `@atLeastOne`를 붙이면 해당 컬렉션 쪽이 *1개 이상*으로 표시됩니다:

```ts
@Entity()
export class Author {
  /** @atLeastOne */
  @OneToMany(() => Post, (post) => post.author)
  posts = new Collection<Post>(this);
}
```

이렇게 하면 ERD 관계선이 `Post }o--|| Author`에서 `Post }|--|| Author`로 바뀝니다. 이는 문서용 힌트일 뿐이며 — MikroORM에는 스키마 레벨의 최소 개수 개념이 없어 실제로 강제되지는 않습니다. (Mermaid는 0개 이상 / 1개 이상만 구분하므로 그보다 큰 최소값은 표현할 수 없습니다.)

## 관계선의 양 끝

하나의 관계선은 **양 끝이 따로 결정**됩니다:

- **단수(1) 쪽** (`@ManyToOne`, 또는 소유 측 `@OneToOne`) — 스키마에서 자동으로 읽으며 태그가 필요 없습니다: 기본 *정확히 1* (`||`), `nullable: true`이면 *0 또는 1* (`o|`). 소유 측 `@OneToOne`의 반대쪽은 항상 *0 또는 1* 입니다 — unique FK는 참조를 최대 1개로 제한할 뿐, 반드시 1개를 요구하지는 않습니다.
- **컬렉션(N) 쪽** (`@OneToMany` / `@ManyToMany`) — 기본 *0개 이상*이며, `@atLeastOne`을 붙이면 해당 쪽이 *1개 이상*으로 바뀝니다 (컬렉션이 관계선의 어느 쪽에 렌더링되는지에 따라 `}o` → `}|` 또는 `o{` → `|{`).

네 가지 조합 (`Post` ↔ `Author`):

```text
Post }o--|| Author   →  author 0+ posts,  post exactly 1 author   (default)
Post }o--o| Author   →  author 0+ posts,  post 0-or-1 author      (nullable: true)
Post }|--|| Author   →  author 1+ posts,  post exactly 1 author   (@atLeastOne)
Post }|--o| Author   →  author 1+ posts,  post 0-or-1 author      (both)
```
