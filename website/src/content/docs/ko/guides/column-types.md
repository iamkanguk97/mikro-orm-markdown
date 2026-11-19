---
title: 컬럼 타입
description: 컬럼 타입을 정해진 일반 단어로 표시하는 방식을 설명합니다.
---

인식된 컬럼 타입은 ERD와 컬럼 표 모두에서 11개의 일반 단어 중 하나로 표시됩니다. 그래서 같은 엔티티는 PostgreSQL, MySQL, MariaDB, SQLite 어디에서나 똑같이 표시됩니다.

| 단어 | 선언한 타입 |
|---|---|
| `string` | `string`, `text`, `varchar`, `char`, `citext`, `inet`, `xml`, `enum` 등 |
| `uuid` | `uuid` |
| `integer` | `number`, `integer`, `int`, `smallint`, `bigint`, `serial` 등 |
| `float` | `float`, `double`, `double precision`, `real` |
| `decimal` | `decimal`, `numeric`, `money` |
| `boolean` | `boolean`, `bool`, `tinyint(1)` |
| `datetime` | `Date`, `datetime`, `timestamp`, `timestamptz` |
| `date` | `date` |
| `time` | `time`, `timetz` |
| `json` | `json`, `jsonb` |
| `binary` | `blob`, `bytea`, `binary`, `varbinary`, `Buffer`, `Uint8Array` |

## 매칭 방식

- 이름은 대소문자를 구분하지 않고 비교하며, 길이와 정밀도는 무시합니다. `VARCHAR(255)`는 `string`으로, `numeric(10,2)`는 `decimal`로 표시됩니다.
- 대소문자를 구분하는 경우는 `Date` 하나입니다. JavaScript의 `Date` 프로퍼티는 날짜와 시간을 함께 담으므로 `datetime`으로 표시되고, SQL 타입 `date`는 `date`로 표시됩니다.
- 단어는 DB 컬럼 타입(`columnType`)이 아니라 엔티티 타입(`type`)에서 정해집니다. `columnType: 'real'`로 float 컬럼을 지정한 `number` 프로퍼티도 `integer`로 표시됩니다.
- 일반 단어가 없는 타입은 선언한 그대로 표시됩니다. `interval`, `geometry`, `tsvector`, `string[]`, 그리고 `PointType` 같은 커스텀 타입이 해당합니다.

## 선언한 그대로 표시되는 타입과 ERD

ERD는 이런 타입을 컬럼 표와 같은 글자로 그립니다. Mermaid 원본에서만 두 가지가 다릅니다.

- 영문, 숫자, `_ - [ ] ( ) . ,` 이외의 글자가 있거나 영문 또는 `_`로 시작하지 않는 타입은 백틱으로 감쌉니다.
- 백틱 안의 `<`, `>`, `#`, `&`, `~`, 백틱은 `#lt;` 같은 Mermaid 엔티티 코드로 씁니다. 그대로 두면 Mermaid가 서식 기호로 읽기 때문입니다.

| 선언 | Mermaid 원본 | 그림 |
|---|---|---|
| `string[]` | `string[]` | `string[]` |
| `geometry(Point,4326)` | `geometry(Point,4326)` | `geometry(Point,4326)` |
| `bit varying(8)` | `` `bit varying(8)` `` | `bit varying(8)` |
| `'draft' \| 'published'` (TypeScript 유니언) | `` `"draft" \| "published"` `` | `"draft" \| "published"` |
| `Map<string, number>` | `` `Map#lt;string, number#gt;` `` | `Map<string, number>` |

Mermaid는 11.16부터 컬럼 타입의 쉼표와 점, 그리고 백틱으로 감싼 타입을 받습니다. 그보다 오래된 Mermaid로 그리는 도구는 이런 타입이 들어간 다이어그램을 그리지 못합니다. GitHub에서는 모두 그려집니다.

## 타입과 이름이 같은 커스텀 타입

타입은 이름만으로 비교합니다. 그래서 커스텀 타입 클래스의 이름이 인식되는 타입 이름과 같으면(대소문자 무시), 클래스 이름 대신 그 타입의 단어로 표시됩니다:

| 커스텀 타입 클래스 | 표시 결과 |
|---|---|
| `Money` | `decimal` |
| `Time` | `time` |
| `Xml` | `string` |
| `MoneyType` | `MoneyType` |

클래스 이름을 그대로 표시하려면 `MoneyType`처럼 타입 이름과 겹치지 않는 이름을 사용하세요.
