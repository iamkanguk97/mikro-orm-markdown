---
title: 컬럼 제외
description: 감사(audit) 타임스탬프처럼 반복되는 컬럼을 모든 엔티티에서 제외합니다.
---

공통 base 엔티티에서 상속한 감사(audit) 컬럼(`created_at`, `updated_at` 등)은 모든 테이블에 반복됩니다. DB 컬럼 이름을 나열하면 모든 ERD 박스와 컬럼 표에서 제외됩니다:

```bash
mikro-orm-markdown --config ./mikro-orm.config.ts --exclude-columns created_at updated_at deleted_at
```

[프로그래밍 API](/mikro-orm-markdown/ko/reference/api/)에서는:

```ts
const markdown = await generateMarkdown({
  orm: ormConfig,
  excludeColumns: ['created_at', 'updated_at', 'deleted_at'],
});
```

## 매칭 방식

- 이름은 TypeScript 프로퍼티 이름이 아니라 출력에 표시되는 DB 컬럼 이름과 정확히 일치해야 합니다. `address_street` 같은 펼쳐진 embedded 컬럼도 지정할 수 있습니다.
- 외래 키 컬럼을 제외하면 ERD에서 해당 관계선도 함께 제거됩니다. 복합 외래 키는 모든 컬럼을 나열해야 하며, 일부만 나열하면 해당 키는 그대로 두고 warning을 출력합니다.
- `@erd`로 다른 namespace의 다이어그램에 포함된 엔티티는 그곳에서 기본 키 컬럼만 표시됩니다. 기본 키 컬럼을 모두 제외하면(예: `--exclude-columns id`) 해당 엔티티와 관계선이 다른 namespace의 다이어그램에서 제거되며, 엔티티 자신의 섹션에서는 제외된 컬럼만 빠집니다.
- 인덱스, unique, check 제약 조건은 제외된 컬럼을 포함하더라도 항상 유지됩니다. 실제 스키마를 설명하는 정보이므로, `deleted_at`을 제외해도 `UNIQUE (email, deleted_at)`은 그대로 표시됩니다.
