---
title: Column types
description: How column types are rendered as a fixed set of generic words.
---

Every recognized column type renders as one of 11 generic words, in both the ERD and the column table. The same entities therefore read the same on PostgreSQL, MySQL, MariaDB, and SQLite.

| Word | Declared as |
|---|---|
| `string` | `string`, `text`, `varchar`, `char`, `citext`, `inet`, `xml`, `enum`, … |
| `uuid` | `uuid` |
| `integer` | `number`, `integer`, `int`, `smallint`, `bigint`, `serial`, … |
| `float` | `float`, `double`, `double precision`, `real` |
| `decimal` | `decimal`, `numeric`, `money` |
| `boolean` | `boolean`, `bool`, `tinyint(1)` |
| `datetime` | `Date`, `datetime`, `timestamp`, `timestamptz` |
| `date` | `date` |
| `time` | `time`, `timetz` |
| `json` | `json`, `jsonb` |
| `binary` | `blob`, `bytea`, `binary`, `varbinary`, `Buffer`, `Uint8Array` |

## How matching works

- Names are matched without regard to case, and a length or precision is ignored: `VARCHAR(255)` renders as `string`, `numeric(10,2)` as `decimal`.
- The one exception to case is `Date`. A JavaScript `Date` property holds a date and a time, so it renders as `datetime`; the SQL type `date` renders as `date`.
- The word comes from the entity type (`type`), not the DB column type (`columnType`). A `number` property forced to a float column with `columnType: 'real'` still renders as `integer`.
- A type with no generic word is written as declared: `interval`, `geometry`, `tsvector`, and custom types such as `PointType`.

## Custom types named like a type

Only the name of a type is compared. A custom type class whose name equals a recognized type name, ignoring case, therefore renders as that type's word instead of its own name:

| Custom type class | Rendered as |
|---|---|
| `Money` | `decimal` |
| `Time` | `time` |
| `Xml` | `string` |
| `MoneyType` | `MoneyType` |

To keep the class name in the output, give the class a name that is not a type name, such as `MoneyType`.
