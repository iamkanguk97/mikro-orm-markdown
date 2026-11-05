---
title: Mermaid 렌더링 옵션
description: 생성되는 다이어그램에 Mermaid 레이아웃 엔진이나 테마를 지정합니다.
---

기본적으로 mikro-orm-markdown은 Mermaid frontmatter config를 출력하지 않습니다. 이렇게 해야 각 Markdown 뷰어의 기본 Mermaid 렌더링 동작이 유지됩니다.

CLI에서 Mermaid 렌더링 옵션을 사용하려면:

```bash
mikro-orm-markdown --config ./mikro-orm.config.ts --mermaid-layout elk --mermaid-theme neutral
```

[프로그래밍 API](/mikro-orm-markdown/ko/reference/api/)에서는:

```ts
const markdown = await generateMarkdown({
  orm: ormConfig,
  mermaid: {
    layout: 'elk',
    theme: 'forest',
  },
});
```

layout 또는 theme을 지정하면 각 `erDiagram` 펜스 앞에 YAML frontmatter 블록이 삽입됩니다:

````markdown
```mermaid
---
config:
  layout: elk
  theme: forest
---
erDiagram
  ...
```
````

## layout 값

| 값 | 설명 |
| -- | ---- |
| `dagre` | Mermaid 기본 레이아웃 엔진. |
| `elk` | 대체 레이아웃 엔진. 엔티티가 많거나 관계선이 복잡한 ERD에서 선 라우팅을 개선할 수 있습니다. |
| `elk.stress` | ELK stress 레이아웃 변형. Mermaid 버전과 뷰어에 따라 지원 여부가 다릅니다. |

## theme 값

`default`, `neutral`, `dark`, `forest`, `base`.

:::note
`elk`와 theme 지원 여부는 뷰어마다 다릅니다. `--mermaid-layout`이나 `--mermaid-theme`을 지정하지 않으면 frontmatter는 출력되지 않습니다.
:::
