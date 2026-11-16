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
- 일반 단어가 없는 타입은 선언한 그대로 표시됩니다. `interval`, `geometry`, `tsvector`, 그리고 `PointType` 같은 커스텀 타입이 해당합니다.

## 타입과 이름이 같은 커스텀 타입

타입은 이름만으로 비교합니다. 그래서 커스텀 타입 클래스의 이름이 인식되는 타입 이름과 같으면(대소문자 무시), 클래스 이름 대신 그 타입의 단어로 표시됩니다:

| 커스텀 타입 클래스 | 표시 결과 |
|---|---|
| `Money` | `decimal` |
| `Time` | `time` |
| `Xml` | `string` |
| `MoneyType` | `MoneyType` |

클래스 이름을 그대로 표시하려면 `MoneyType`처럼 타입 이름과 겹치지 않는 이름을 사용하세요.
