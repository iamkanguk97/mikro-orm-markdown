---
title: 개요
description: mikro-orm-markdown이 무엇을 생성하는지, 언제 쓰면 좋은지 소개합니다.
---

**mikro-orm-markdown**는 [MikroORM](https://mikro-orm.io) 엔티티에서 **Mermaid ERD 다이어그램**과 **Markdown 데이터베이스 스키마 문서**를 생성하는 MikroORM ERD generator입니다.

CLI 또는 TypeScript API로 실행 중인 데이터베이스 연결 없이 엔티티 컬럼, 관계, 인덱스, 제약 조건, JSDoc 설명을 문서화할 수 있습니다.

## 주요 기능

- **Mermaid ERD 다이어그램** — MikroORM 엔티티 메타데이터에서 생성합니다
- **Markdown 스키마 문서** — 엔티티별 컬럼 테이블, 실제 DB 컬럼명, 키, nullable 여부, 설명, 인덱스, 제약 조건을 포함합니다
- **JSDoc 기반 그룹화 및 노출 제어** — `@namespace`, `@erd`, `@describe`, `@hidden`을 사용합니다
- **실행 중인 DB 연결 불필요** — MikroORM config의 메타데이터 discovery를 사용합니다
- **일반적인 SQL 드라이버 지원** — SQLite, PostgreSQL, MySQL, MariaDB smoke test로 검증합니다

## MikroORM 고유 개념

Prisma 기반 도구로는 표현할 수 없는 MikroORM 고유 개념도 함께 시각화합니다.

- **Embeddable** — 소유 엔티티의 테이블 안에 저장되는 값 객체입니다. `@Embedded` 옵션에 따라 펼쳐진 컬럼(예: `address_street`, `address_city`) 또는 JSON 컬럼으로 저장됩니다. 별도 테이블은 생성되지 않습니다.
- **Single Table Inheritance (STI)** — `Dog`, `Cat` 같은 자식 클래스가 `animals` 테이블 하나를 공유합니다. `type` 같은 discriminator 컬럼으로 어떤 자식 클래스인지 구분합니다. [Single Table Inheritance](/mikro-orm-markdown/ko/guides/sti/)를 참고하세요.
- **@Formula** — 실제 DB 컬럼 없이 SELECT 시 SQL 식(예: `LENGTH(name)`)으로 값을 계산하는 가상 컬럼입니다.

생성 결과에는 다음과 같은 표기로 나타납니다:

| 표기               | 의미                                         |
| ------------------ | -------------------------------------------- |
| `formula: <expr>`  | `@Formula` 계산 컬럼의 Mermaid 주석          |
| `[EmbeddableType]` | `@Embedded` 값 객체에서 flat으로 저장된 컬럼 |
| `discriminator`    | STI 구분자 컬럼                              |

## 다음 단계

- [설치](/mikro-orm-markdown/ko/getting-started/installation/)하고 요구사항을 확인하세요.
- [빠른 시작](/mikro-orm-markdown/ko/getting-started/quick-start/)을 따라 첫 `ERD.md`를 생성해 보세요.
- [예시](/mikro-orm-markdown/ko/examples/)에서 실제로 생성된 출력을 살펴보세요.

> [@samchon](https://github.com/samchon)의 [prisma-markdown](https://github.com/samchon/prisma-markdown)에서 큰 영감을 받았습니다.
