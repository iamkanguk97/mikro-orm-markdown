# 코드 리뷰 — 사용자 대면 이슈 백로그

> **이 문서로 작업을 시작하는 법 (새 세션용)**
>
> 1. 이 파일 전체를 읽는다. 각 항목은 `심각도 · file:line · 문제 · Fix · 상태`로 구성된다.
> 2. **HIGH → MEDIUM → LOW** 순으로 처리한다. HIGH의 H1/H2는 함께 고치는 것이 효율적이다.
> 3. 착수 전 해당 `file:line`을 직접 열어 현재 코드를 확인한다 — 라인 번호는 아래 **기준 커밋** 시점 값이라 드리프트했을 수 있다.
> 4. 각 항목은 가능하면 "버그를 재현하는 테스트 → 수정 → 통과" 순으로 진행한다.
> 5. 완료 시 상태 체크박스를 `[x]`로 바꾸고, 무엇을 어떻게 검증했는지 한 줄 남긴다.
>
> **기준 커밋:** `48ea6b9` · **테스트 베이스라인:** `npm test` → 117 pass

---

## 배경

- **대상:** `mikro-orm-markdown` — MikroORM 엔티티 메타데이터를 Markdown + Mermaid ERD로 렌더링하는 OSS CLI/라이브러리.
- **리뷰 소스:** 사용자 관점 심층 감사(렌더링·정확성) + Codex 리뷰(CLI 실행·메타/프로세스)를 통합. MikroORM 6.6 타입 정의와 실제 discovery로 교차 검증, 일부는 end-to-end 재현.
- **권고:** 안정 릴리스 기준 **REQUEST CHANGES**, alpha로는 OK(아래 항목을 알려진 제약으로 문서화 시).
- **총 이슈:** 19건 (HIGH 4 · MEDIUM 8 · LOW 7).

## 이미 반영된 항목 (재작업 금지)

아래 5건은 별도 작업으로 **커밋·푸시 완료**(`48ea6b9`). 다시 손대지 말 것.

- [x] TOC 앵커 유니코드 깨짐 → `toMarkdownAnchor`를 `\p{L}\p{N}` + `u` 플래그로 수정 (`src/render/escape.ts`)
- [x] 빈/미해결 formula가 깨진 인라인 코드로 렌더 → 컬럼명만 출력하도록 가드 (`src/render/markdown.ts`)
- [x] TOC 링크 라벨의 `[` `]` 미이스케이프 → 국소 이스케이프 (`src/render/markdown.ts`)
- [x] 부정확한 mermaid 주석(이름 매핑) 정정 (`src/render/mermaid.ts`)
- [x] 리스트 섹션 빌더 3중 복붙 → `renderBulletSection` 추출 (`src/render/markdown.ts`)

---

## 🔴 HIGH

### [x] H1. `.ts` config 로딩이 cwd/tsconfig 위치에 민감해 cryptic하게 실패
- **위치:** `src/cli.ts:29` (`loadOrmOptions`)
- **문제:** repo 루트에서 `node dist/cli.js -c examples/mikro-orm.config.ts ...` 실행 시 `Cannot read properties of undefined (reading 'constructor')`로 실패. `examples/`로 이동해 실행하면 성공. README:59는 "CLI가 `.ts` config를 자동 로드"한다고만 안내 → 사용자가 워킹 디렉터리/tsconfig 차이로 막히고 원인 파악 불가. **재현됨.**
- **Fix:** config 파일 기준 nearest `tsconfig` 탐색 + `register({ tsconfig })`, decorator/tsconfig mismatch 전용 에러 메시지, 필요 시 `--tsconfig` 옵션.
- **완료(`f244e6f`):** `findNearestTsconfig`로 config 파일 옆 tsconfig를 찾아 `register({ tsconfig })`에 명시 전달 + `--tsconfig` 옵션 + `.ts` 로드 실패 시 데코레이터/메타데이터 진단 힌트. 루트 cwd 스모크 성공 확인, 신규 테스트 3건, `npm test` 120 pass.

### [x] H2. 설정/메타데이터 실패 시 진짜 원인(cause)이 버려짐
- **위치:** `src/cli.ts:97` (+ `src/metadata/load.ts:45`)
- **문제:** `MetadataLoadError`가 MikroORM 실제 에러를 `cause`에 담지만 CLI는 `err.message`(일반 문구)만 출력. 가장 흔한 셋업 실수(entities glob 오타, 드라이버 미설치)에서 "Make sure your config is valid..."만 보여 진단 불가. H1과 함께 "안 되는데 왜인지 모름"을 만드는 핵심 쌍.
- **Fix:** discovery 실패 시 `cause.message`(또는 cause 체인)를 함께 출력.
- **완료(`다음 커밋`):** `formatErrorChain` 헬퍼로 `cause` 체인을 따라가며 `↳ caused by:` 형태로 모두 출력(순환 가드 포함). 드라이버 미지정 재현 시 "No driver specified..." 실제 원인 노출 확인, 신규 테스트 3건, `npm test` 123 pass.

### [x] H3. 컴파일된 `.js` 엔티티에서 JSDoc/태그가 조용히 소실 — README가 그 경로를 권장
- **위치:** `src/docs/jsdoc.ts:62` (+ `README.md:60,277`, `src/metadata/load.ts:61`)
- **문제:** JSDoc은 `m.path` 소스를 ts-morph로 파싱하는데 빌드 시 주석이 제거됨 → 모든 Description 공백, `@namespace`가 `default`로 붕괴, **`@hidden` 엔티티가 문서에 노출**(가장 위험). exit 0이라 실패 인지도 안 됨. 그런데 README는 프로덕션에서 `entities: ['./dist/**/*.js']`를 안내.
- **Fix:** `--src`/programmatic `src` 옵션 부활, 또는 `.js` config 사용 시 JSDoc 손실 가능성을 명확히 경고.
- **완료(`다음 커밋`):** 둘 다 적용. `resolveJsDocSources`로 ① `src`/`--src <paths...>` 지정 시 그 `.ts`에서 JSDoc 추출 ② 미지정 + discovery 경로가 `.js`면 `onWarn`으로 경고(CLI는 stderr). `generateMarkdown`에 `src`/`onWarn` 옵션 추가, README JSDoc 섹션에 주의 문구 추가. `--src` 스모크 성공, 신규 테스트 3건, `npm test` 126 pass.

### [x] H4. 파라미터형 SQL 타입이 마크다운 표에서도 손상
- **위치:** `src/render/mermaid.ts:96, 345` (`normalizeType`)
- **문제:** Mermaid 식별자용 `normalizeType`을 build 시점에 적용해 `ColumnModel.type`에 저장 → 표가 손상값을 그대로 사용. `varchar(255)`→`varchar_255_`, `numeric(10,2)`→`numeric_10_2_`. 사람이 읽는 문서 표(README:15 "types")가 깨짐. 흔한 케이스.
- **Fix:** 원본 타입을 모델에 보존하고 Mermaid 출력 시점에만 새니타이즈(표는 원본 타입 표시).
- **완료(`다음 커밋`):** build 시점 `normalizeType` 제거(원본 `prop.type` 저장), 미사용 함수 삭제. Mermaid는 기존대로 출력 시점 `toMermaidIdentifier`로 새니타이즈(출력 불변). 픽스처에 `varchar(255)` 컬럼 추가해 표=원본/머메이드=`varchar_255_` 검증, 신규 테스트 2건, `npm test` 128 pass, `examples/ERD.md` 무변경.

---

## 🟡 MEDIUM

### [x] M1. 비추상 STI 루트 오분류 → 자식 컬럼 누수 + discriminator 표기 누락
- **위치:** `src/model/build.ts:39` (`isStiRoot`/`isStiChild`) — *실제로는 드리프트로 `src/render/mermaid.ts:37`에 있었음*
- **문제:** `abstract:true` 없는 STI 루트는 MikroORM이 루트에도 `discriminatorValue` 부여 → `isStiRoot`가 false → `prop.inherited` 필터 미작동으로 모든 서브클래스 컬럼이 루트에 나오고 STI 노트/마커 사라짐(README 249–266 정반대).
- **Fix:** 루트 판별을 `discriminatorColumn` 존재 + (자체 미상속) 기준으로 보강.
- **완료(`다음 커밋`):** `isStiRoot`를 `discriminatorColumn !== undefined && !meta.extends`로 변경. 비추상 루트(`Vehicle`/`Car`) 재현으로 자식 컬럼 `doors` 누수 + 마커 누락 확인 → 수정 후 루트 컬럼 `[id,name,type]`, `discriminatorColumn='type'` 정상. 신규 테스트 1건, `npm test` 129 pass, `examples/ERD.md` 무변경.

### [x] M2. `object:true`/`array:true` 임베디드가 단일 JSON 컬럼에 중복 행 생성
- **위치:** `src/render/mermaid.ts:83` (`buildColumns`)
- **문제:** 필드별 합성 leaf가 모두 같은 fieldName을 가리키는데 dedupe 안 함 → 동일 컬럼명 N개 행 출력. README:30이 JSON 컬럼 임베디드 지원 명시.
- **Fix:** `prop.object`/`prop.array` 인지해 단일 JSON 컬럼으로 표현하거나 fieldName 기준 dedupe.
- **완료(`다음 커밋`):** 재현 결과 이 버전에선 leaf가 실제 컬럼처럼 펼쳐지는 형태(`id,street,city`)였음 — 실제 스키마는 JSON 컬럼 1개. EMBEDDED 분기에서 `prop.object||prop.array`면 단일 `json` 컬럼(`embeddedIn`=`Addr` 또는 `Addr[]`) emit, SCALAR leaf(`object&&embedded`)는 skip. inline(비-object) 임베디드는 불변. 신규 테스트 1건, `npm test` 130 pass, `examples/ERD.md` 무변경.

### [x] M3. 실제 `tableName`이 어디에도 렌더링되지 않음
- **위치:** `src/model/types.ts:69`, `src/render/mermaid.ts:299`
- **문제:** `EntityModel.tableName`은 저장되지만 Mermaid/Markdown 모두 class name만 사용. DB 문서 도구에서 실제 테이블명(`users`)은 사용자가 가장 먼저 보고 싶은 정보.
- **Fix:** 엔티티 섹션에 `Table: users` 표기 추가, 가능하면 Mermaid label에도 반영.
- **완료(`다음 커밋`):** 엔티티 섹션 제목 아래에 `*Table: \`name\`*` 추가(Mermaid 식별자는 관계 참조 일관성 위해 className 유지). STI 자식은 루트 테이블명 표시. 신규 테스트 1건, `npm test` 131 pass, `examples/ERD.md` 재생성(Table 라인만 추가됨 확인).

### [x] M4. 비문자열 `@Formula` 반환값이 마크다운 렌더러를 크래시
- **위치:** `src/render/mermaid.ts:126` (`resolveFormulaExpr`)
- **문제:** throw만 catch하고 비문자열 반환은 통과 → `renderMarkdownInlineCode→normalizeInlineText`의 `value.replace`에서 크래시(Mermaid는 생존).
- **Fix:** `resolveFormulaExpr` 결과를 `String()` 강제 또는 `typeof` 검증.
- **완료(`다음 커밋`):** 숫자 반환 formula로 `value.replace is not a function` 크래시 재현 → `typeof result === 'string' ? result : String(result)`로 강제. 신규 테스트 1건, `npm test` 132 pass.

### [x] M5. `@Enum` 허용값(`prop.items`)이 전혀 렌더링되지 않음
- **위치:** `src/model/build.ts:73` (SCALAR 처리)
- **문제:** `enum:true`/`items`를 안 읽어 타입명만 표시. 네이티브 enum 미지원(README 예제도 수기 JSDoc "One of: ..."로 우회).
- **Fix:** enum이면 `prop.items`를 Description/Key 또는 별도 표기로 노출.
- **완료(`다음 커밋`):** `ColumnModel.enumItems` 추가, `prop.enum && prop.items`에서 채움. 마크다운 표 Description에 `One of: a, b` 노출(표 셀 백틱 이스케이프 때문에 평문, 기존 설명과 줄바꿈 병합). 부수효과로 STI discriminator(`type`) 컬럼이 `One of: dog, cat` 표시 → L1 일부 자연 해소. 신규 테스트 2건, `npm test` 134 pass, `examples/ERD.md` 재생성(enum 라인만).

### [x] M6. `loadJsDoc`의 "Never throws" 계약 위반
- **위치:** `src/docs/jsdoc.ts:45`
- **문제:** try/catch 부재로 읽기 불가 파일(EACCES, 경로가 디렉터리)에서 ts-morph가 throw → 전체 생성 중단. "문서 누락이 생성을 막지 않는다"는 설계 목표와 모순.
- **Fix:** 파싱 루프를 try/catch로 감싸 파일 단위로 실패를 흡수.
- **완료(`다음 커밋`):** 읽기 불가 파일(chmod 000)로 EACCES throw 재현 → 경로별 `addSourceFilesAtPaths` + 파일별 파싱을 각각 try/catch로 흡수(부분 성공 유지). 신규 테스트 1건(불가 파일+유효 글롭 혼합 시 throw 없이 정상 파싱), `npm test` 135 pass.

### [x] M7. 빌드된 `dist/cli.js`를 실제 bin처럼 실행하는 e2e 스모크 테스트 부재
- **위치:** `test/cli.test.ts:31`, `.github/workflows/ci.yml:28`
- **문제:** 테스트가 helper/programmatic 중심이라 H1 같은 cwd/tsconfig 문제를 CI가 못 잡음.
- **Fix:** `npm run build` 후 `node dist/cli.js -c ... -o tmp.md` 스모크 + `npm pack` 후 임시 프로젝트 설치 테스트를 CI에 추가.
- **완료(`다음 커밋`):** `test/e2e/cli-smoke.test.ts` 추가 — beforeAll에서 빌드 후 **루트 cwd**에서 `node dist/cli.js -c examples/...ts` 실행, 출력 검증(H1 회귀를 잡는 유일한 테스트). CI에 Build 후 E2E smoke 스텝 추가. `npm test` 136 pass(8 파일). `npm pack` 설치 테스트는 범위 외로 보류.

### [x] M8. 드라이버 지원 주장 과대 (SQLite만 테스트)
- **위치:** `README.md:20`, `package.json`
- **문제:** PostgreSQL/MySQL/MariaDB/MSSQL 지원 명시하나 dev 의존성·테스트는 SQLite뿐. 드라이버별 metadata 차이 미검증.
- **Fix:** 드라이버별 최소 smoke fixture 추가, 또는 "metadata-based, primarily tested with SQLite"로 문구 완화.
- **완료(`다음 커밋`):** 문구 완화 채택 — "driver-agnostic, SQLite로 테스트, 타 드라이버는 동작 예상이나 자동 테스트 미커버"로 정정. 드라이버 패키지 설치/네이티브 의존성 부담 때문에 fixture는 보류.

---

## 🟢 LOW

### [x] L1. STI discriminator 값/맵 미표시 + 다단계 STI는 직속 부모만 표기
- **위치:** `src/model/build.ts:36`, `src/render/markdown.ts:84`
- **문제:** `type='dog'` 같은 discriminator 값이 안 보이고, 3단계(A←B←C)는 직속 부모만 표기.
- **완료(`다음 커밋`):** `EntityModel.discriminatorValue` 추가(자식의 `meta.discriminatorValue`, `0` 보존 위해 `String()`). Extends 노트를 `*Extends \`Animal\` (Single Table Inheritance, discriminator value: \`dog\`)*`로 확장. M5로 루트 discriminator 컬럼의 허용값(`One of: dog, cat`)도 이미 표시됨. 다단계 직속부모 표기는 M3의 `Table:`(실제 루트 테이블 명시)로 혼동 완화돼 직속 부모 유지. 신규 테스트 1건, 137 pass, `examples/ERD.md` 재생성.

### [x] L2. `@atLeastOne`가 단방향 1:N/라벨 불일치 시 조용히 무효
- **위치:** `src/model/build.ts:168` (`applyAtLeastOne`)
- **문제:** mappedBy 없는 `@OneToMany`에 태그하면 매칭 엣지를 못 찾아 카디널리티 그대로 남고 경고 없이 무시.
- **완료(`다음 커밋`):** `onWarn`을 `buildDocumentModel`→`applyAtLeastOne`에 연결. 매칭 엣지를 못 찾으면 `@atLeastOne on X.y had no effect...` 경고(`generateMarkdown`이 stderr로 출력). 단방향 1:N 재현 테스트 1건, 138 pass, `examples/ERD.md` 불변.

### [ ] L3. `@hidden` 엔티티로의 FK가 대상 없는 orphan 컬럼으로 남음
- **위치:** `src/model/build.ts:60` (`buildDocumentModel`)
- **문제:** 엣지는 제거되지만 FK 컬럼은 남아 문서에 없는 대상을 가리킴(크래시는 아님).

### [ ] L4. 잠재 크래시: 무방어 프로퍼티 접근 (방어적 비대칭)
- **위치:** `src/render/mermaid.ts:141` (`prop.fieldNames.length`), `src/render/mermaid.ts:96` (`normalizeType(prop.type)`)
- **문제:** 다른 경로는 `?.`/`?? 'integer'`로 가드하는데 이 둘만 무방어. fieldNames/type이 undefined면 크래시. discovery로는 재현 안 됐으나 비대칭은 실재.

### [ ] L5. CHANGELOG에 `alpha.2` 누락 + 잔존 `--src` 참조
- **위치:** `CHANGELOG.md:8,12`
- **문제:** package.json은 `0.1.0-alpha.2`인데 CHANGELOG는 `alpha.1`만 있고, `CHANGELOG.md:12`가 제거된 `--src` 옵션을 나열. 릴리스 추적성 저하.

### [ ] L6. multiline description이 inline escape에서 공백으로 정규화
- **위치:** `README.md:77`, `src/render/markdown.ts:21`
- **문제:** README는 multiline description을 programmatic API로 쓰라 안내하지만 렌더러가 줄바꿈을 공백으로 정규화 → "multiline 보존" 기대 사용자 혼란.

### [ ] L7. `npm audit` devDependency 경로 14건
- **위치:** `package.json` (devDependencies)
- **문제:** `--omit=dev`는 0건이나 전체 audit는 14건(런타임 영향 낮음, 기여자/CI 신호엔 부정적).
- **Fix:** 별도 브랜치에서 MikroORM sqlite/Vitest 계열 업그레이드 검토(강제 수정은 breaking 가능).

---

## 좋은 점 (참고)

- License/Security Policy/CoC/Issue template/Dependabot/Node 18·20·22 CI 등 OSS 기본기 양호.
- TypeScript strict, `any`/하드코딩 secret 없음, 배포 파일 작고 bin shebang/실행권한 정상.
- 설정 로딩 엣지(CJS/named/async default), 중첩(비-object) 임베디드, composite/uuid PK, 자기참조 관계, `discriminatorValue:0`, `connect:false` 연결 회피 — 모두 정상으로 확인됨.

## 검증 방법 (작업 후)

- `npm test` — 베이스라인 117 pass 유지 + 신규 회귀 테스트 통과
- `npm run typecheck && npm run lint` — 무오류
- `npm run example:erd` 후 `git diff examples/ERD.md` — 의도한 변경만 반영되는지 확인
- 루트 cwd 스모크: `node dist/cli.js -c examples/mikro-orm.config.ts -o /tmp/x.md -t t` — H1 수정 후 성공해야 함
