---
title: Relation cardinality
description: How relation ends are drawn, and raising a collection to one-or-more with @atLeastOne.
---

`@atLeastOne` is a JSDoc tag, not a TypeScript decorator.

A collection relation (`1:N` or `M:N`) renders as _zero-or-more_ by default. Tag the collection property with `@atLeastOne` to render that collection side as _one-or-more_ instead:

```ts
@Entity()
export class Author {
  /** @atLeastOne */
  @OneToMany(() => Post, (post) => post.author)
  posts = new Collection<Post>(this);
}
```

This turns the ERD edge `Post }o--|| Author` into `Post }|--|| Author`. It is a documentation hint only — MikroORM has no schema-level minimum, and the count is not enforced. (Mermaid distinguishes only zero-or-more vs. one-or-more, so no larger minimum can be expressed.)

## The two ends of an edge

A relation edge has **two ends, set independently**:

- **Single (1) side** (`@ManyToOne`, or the owning `@OneToOne`) — read from your schema automatically, no tag needed: _exactly-one_ (`||`) by default, _zero-or-one_ (`o|`) when `nullable: true`. The inverse side of an owning one-to-one is always _zero-or-one_ — a unique FK caps references at one but does not require one.
- **Collection (N) side** (`@OneToMany` / `@ManyToMany`) — _zero-or-more_ by default; `@atLeastOne` raises that side to _one-or-more_ (`}o` → `}|`, or `o{` → `|{`, depending on which side of the edge the collection is rendered on).

The four combinations (`Post` ↔ `Author`):

```text
Post }o--|| Author   →  author 0+ posts,  post exactly 1 author   (default)
Post }o--o| Author   →  author 0+ posts,  post 0-or-1 author      (nullable: true)
Post }|--|| Author   →  author 1+ posts,  post exactly 1 author   (@atLeastOne)
Post }|--o| Author   →  author 1+ posts,  post 0-or-1 author      (both)
```
