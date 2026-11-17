---
title: 문제 해결
description: 자주 겪는 discovery 문제와 JSDoc 문제를 해결하는 방법입니다.
---

## "엔티티가 발견되지 않았습니다" (No entities were discovered)

MikroORM config가 엔티티를 0개 찾은 경우입니다. 보통 CLI가 config를 로드하는 방식과 엔티티 경로가 맞지 않아 발생합니다.

- `.ts` config를 사용 중이라면(CLI가 `tsx`를 자동으로 로드하고 기본적으로 `preferTs: true`를 적용합니다), `entitiesTs`가 TypeScript 소스 파일을 가리키는지 확인하세요.
- 빌드된 `.js` config를 사용 중이라면, `entities`가 **빌드 결과물**(예: `./dist/**/*.entity.js`)을 가리키고 빌드를 먼저 실행했는지 확인하세요.
- MikroORM은 TypeScript 모드에서는 `entitiesTs`를, 그 외에는 `entities`를 사용합니다. 폴더/파일 기반 discovery를 쓴다면 두 옵션을 모두 지정하세요.

## "Please provide either 'type' or 'entity' attribute"

MikroORM이 metadata discovery 중 프로퍼티 타입을 해석하지 못한 경우입니다. CLI는 `.ts` config를 `tsx`로 로드하므로, 이 경로에서는 `emitDecoratorMetadata`를 켜는 것만으로는 해결되지 않습니다.

다음 중 하나로 해결하세요:

- `@Property({ type: 'string' })`, `@ManyToOne({ entity: () => User })`처럼 데코레이터 옵션을 명시합니다.
- `@mikro-orm/reflection`을 `@mikro-orm/core`와 정확히 같은 버전으로 설치해 CLI가 `TsMorphMetadataProvider`를 자동으로 사용하게 합니다.

## "Cannot find module '@/...'" (경로 alias)

config나 엔티티에서 `tsconfig`의 경로 alias(예: `@/entities/user`)를 사용한다면, `tsx`가 올바른 `tsconfig.json`을 찾지 못했을 때 alias를 해석하지 못할 수 있습니다. config 파일을 `tsconfig.json`과 같은 프로젝트 루트에 두면 이 문제를 피할 수 있습니다. config가 다른 위치에 있다면 명시적으로 전달하세요:

```bash
mikro-orm-markdown --config ./packages/api/mikro-orm.config.ts --tsconfig ./packages/api/tsconfig.json
```

## JSDoc 태그가 누락되거나 `@hidden` 엔티티가 노출되는 경우

엔티티가 컴파일된 JavaScript에서 discovery되고 있을 가능성이 큽니다. 빌드 도구는 `.js` 파일에서 주석을 제거할 수 있으므로, 설명과 `@namespace`, `@hidden`을 읽지 못할 수 있습니다.

가능하면 `.ts` config와 원본 소스 파일을 가리키는 `entitiesTs`를 사용하세요. 반드시 컴파일된 `.js`에서 실행해야 한다면 원본 TypeScript 소스를 함께 전달하세요:

```bash
mikro-orm-markdown --config ./dist/mikro-orm.config.js --src "src/**/*.entity.ts"
```

[컴파일된 JavaScript 빌드](/mikro-orm-markdown/ko/guides/compiled-js/)를 참고하세요.

## STI 클래스에 선언하지 않은 제약조건이 표시되는 경우

Single Table Inheritance에서는 모든 클래스가 테이블 하나를 공유합니다. MikroORM은 각 서브클래스의 클래스 단위 index, unique, check를 하나의 목록으로 합치며, 어느 클래스에서 선언했는지는 기록하지 않습니다.

- 프로퍼티 이름을 가리키는 제약조건(`@Index({ properties: ['breed'] })`)은 그 프로퍼티를 모두 가진 클래스에만 표시됩니다.
- SQL `expression`으로만 작성한 제약조건은 루트와 모든 서브클래스에 표시됩니다. SQL 문자열을 분석해 컬럼을 찾지 않기 때문입니다.

제약조건을 한 서브클래스의 섹션에만 표시하려면, 가능한 경우 `expression` 대신 `properties`로 선언하세요. [Single Table Inheritance (STI)](/mikro-orm-markdown/ko/guides/sti/#제약조건)를 참고하세요.

## 서브클래스에만 있는 프로퍼티가 STI 루트와 다른 서브클래스에 표시되는 경우

MikroORM v6와 7.1.5보다 낮은 v7에서는, 둘 이상의 서브클래스가 같은 이름으로 각각 선언한 프로퍼티가 루트의 프로퍼티로 전달됩니다. 그래서 그 프로퍼티가 루트와 모든 서브클래스에 표시됩니다. 컬럼, 관계선, 프로퍼티 단위 index·unique가 모두 해당합니다.

MikroORM의 메타데이터에서 비롯된 문제이며, 루트가 실제로 선언한 프로퍼티와 구분할 수 없습니다. MikroORM v7.1.5 이상으로 올리면 해결됩니다. [Single Table Inheritance (STI)](/mikro-orm-markdown/ko/guides/sti/#이전-mikroorm-버전에서의-제한)를 참고하세요.

## Config 파일 요구사항

config 파일은 일반 설정 객체를 **default export** 해야 합니다 — [CLI 옵션](/mikro-orm-markdown/ko/reference/cli/#config-파일-요구사항)을 참고하세요. config를 비동기적으로 만들어야 한다면 [프로그래밍 API](/mikro-orm-markdown/ko/reference/api/)를 사용하세요.
