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
- A type with no generic word is written as declared: `interval`, `geometry`, `tsvector`, `string[]`, and custom types such as `PointType`.

## Types written as declared, in the ERD

The ERD draws such a type with the same spelling as the column table. Only the Mermaid source differs, in two ways:

- A type is wrapped in backticks when it contains anything other than letters, digits, and `_ - [ ] ( ) . ,`, or when it does not start with a letter or `_`.
- Inside backticks, `<`, `>`, `#`, `&`, `~`, and a backtick are written as Mermaid entity codes such as `#lt;`, because Mermaid would otherwise read them as markup.

| Declared as | Mermaid source | Drawn as |
|---|---|---|
| `string[]` | `string[]` | `string[]` |
| `geometry(Point,4326)` | `geometry(Point,4326)` | `geometry(Point,4326)` |
| `bit varying(8)` | `` `bit varying(8)` `` | `bit varying(8)` |
| `'draft' \| 'published'` (TypeScript union) | `` `"draft" \| "published"` `` | `"draft" \| "published"` |
| `Map<string, number>` | `` `Map#lt;string, number#gt;` `` | `Map<string, number>` |

Mermaid accepts a comma, a dot, and a backtick-wrapped type from 11.16 on. A tool that renders with an older Mermaid fails to draw a diagram that contains one. GitHub draws all of them.

## Custom types named like a type

Only the name of a type is compared. A custom type class whose name equals a recognized type name, ignoring case, therefore renders as that type's word instead of its own name:

| Custom type class | Rendered as |
|---|---|
| `Money` | `decimal` |
| `Time` | `time` |
| `Xml` | `string` |
| `MoneyType` | `MoneyType` |

To keep the class name in the output, give the class a name that is not a type name, such as `MoneyType`.
