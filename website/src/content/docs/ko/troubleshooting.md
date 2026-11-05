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

## Config 파일 요구사항

config 파일은 일반 설정 객체를 **default export** 해야 합니다 — [CLI 옵션](/mikro-orm-markdown/ko/reference/cli/#config-파일-요구사항)을 참고하세요. config를 비동기적으로 만들어야 한다면 [프로그래밍 API](/mikro-orm-markdown/ko/reference/api/)를 사용하세요.
