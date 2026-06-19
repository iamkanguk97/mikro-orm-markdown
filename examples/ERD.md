# Example Schema

Generated from the entities in examples/entities - a tour of every feature mikro-orm-markdown can render.

## Contents

- [Animals](#animals)
- [Blog](#blog)
- [Reporting](#reporting)
- [Shop](#shop)

## Animals

```mermaid
erDiagram
  Animal {
    integer id PK
    string name
    string type "discriminator"
  }
  Dog {
    integer id PK
    string name
    string type
    string breed
  }
  Cat {
    integer id PK
    string name
    string type
    boolean indoor
  }
```

### Animal

*Table: `animal`*

> Base class for all animals (Single Table Inheritance root). Dog and Cat
> share one physical table, told apart by the type discriminator column.
> STI has no Prisma equivalent.

*STI root — discriminator column: `type`*

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| name | string |  |  | Display name. |
| type | string | discriminator |  | One of: dog, cat |

**Constraints:**

- Index `animal_name_idx`: (name)

### Dog

*Table: `animal`*

> A dog — stored in the Animal table with type = 'dog'.

*Extends `Animal` (Single Table Inheritance)*

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| name | string |  |  |  |
| type | string |  |  | One of: dog, cat |
| breed | string |  | Y | Breed, if known. |

**Constraints:**

- Index `animal_name_idx`: (name)

### Cat

*Table: `animal`*

> A cat — stored in the Animal table with type = 'cat'.

*Extends `Animal` (Single Table Inheritance)*

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| name | string |  |  |  |
| type | string |  |  | One of: dog, cat |
| indoor | boolean |  | Y | Whether the cat is kept indoors. |

**Constraints:**

- Index `animal_name_idx`: (name)

## Blog

```mermaid
erDiagram
  User {
    integer id PK
    string username UK
    string email UK
    datetime created_at
    integer profile_id FK
  }
  Tag {
    integer id PK
    string label UK
  }
  Profile {
    integer id PK
    text bio
    string avatar_url
  }
  Post {
    integer id PK
    string title
    string status
    text body
    integer author_id FK
    integer body_length "formula: LENGTH(body)"
  }
  Comment {
    integer id PK
    text content
    integer post_id FK
    integer author_id FK
    integer parent_id FK
  }
  User ||--o| Profile : "profile"
  Post }o--|| User : "author"
  Post }o--|{ Tag : "tags"
  Comment }o--|| Post : "post"
  Comment }o--o| User : "author"
  Comment }o--o| Comment : "parent"
```

### User

*Table: `user`*

> A registered user who can author posts.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  | Surrogate primary key. |
| username | string | UK |  | Unique login handle. |
| email | string | UK |  | Contact email (unique). |
| created_at | datetime |  |  | When the account was created. |
| profile_id | integer | FK (profile) | Y | Optional one-to-one profile; this side owns the foreign key. |

### Tag

*Table: `tag`*

> A label that can be attached to many posts.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| label | string | UK |  | Unique, human-readable tag name. |

### Profile

*Table: `profile`*

> Extended profile information for a user.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| bio | text |  | Y | Free-form biography. |
| avatar_url | string |  | Y | URL of the avatar image. |

### Post

*Table: `post`*

> A blog post written by a user.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| title | string |  |  | Headline shown in listings. |
| status | string |  |  | One of: draft, published, archived |
| body | text |  | Y | Full article body. |
| author_id | integer | FK (author) |  | Author of the post (required — non-null relation). |
| body_length | integer |  |  | Character length of the body, computed in SQL at query time (no physical column). |

**Computed columns:**

- `body_length`: `LENGTH(body)`

### Comment

*Table: `comment`*

> A reader comment on a post, optionally threaded under a parent comment.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| content | text |  |  | The comment text. |
| post_id | integer | FK (post) |  | The post being commented on (required). |
| author_id | integer | FK (author) | Y | The commenting user, or null for anonymous guests (nullable relation). |
| parent_id | integer | FK (parent) | Y | Parent comment when this is a threaded reply (self-reference). |

## Reporting

```mermaid
erDiagram
  DailyStats {
    integer id PK
    datetime day
    integer views
  }
```

### ReportSettings

*Table: `report_settings`*

> Reporting configuration. The describe tag below documents it as a table in
> the Reporting section only — it is intentionally left out of the ERD diagram.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| recipient | string |  |  | Email address that receives the daily report. |
| enabled | boolean |  |  | Whether the daily report is enabled. |

## Shop

```mermaid
erDiagram
  Product {
    integer id PK
    string sku UK
    string name
    integer price_cents
  }
  OrderItem {
    integer id PK
    integer quantity
    integer order_id FK
    integer product_id FK
  }
  Order {
    integer id PK
    integer total_cents
    datetime placed_at
    integer customer_id FK
  }
  Customer {
    integer id PK
    string name
    string email
    integer name_length "formula: LENGTH(name)"
    string address_street "[Address]"
    string address_city "[Address]"
    string address_zip_code "[Address]"
  }
  OrderItem }|--|| Order : "order"
  OrderItem }o--|| Product : "product"
  Order }o--|| Customer : "customer"
```

### Product

*Table: `product`*

> A purchasable product.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| sku | string | UK |  | Stock-keeping unit (unique). |
| name | string |  |  | Display name. |
| price_cents | integer |  |  | Price in minor units; the DB column is price_cents per the naming strategy. |

**Constraints:**

- Index: (name)

### OrderItem

*Table: `order_item`*

> A single line item within an order.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| quantity | integer |  |  | Quantity ordered. |
| order_id | integer | FK (order) |  | The parent order (required). |
| product_id | integer | FK (product) |  | The product being ordered (required). |

### Order

*Table: `order`*

> A customer order containing at least one line item.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| total_cents | integer |  |  | Order total in minor units (cents). |
| placed_at | datetime |  |  | When the order was placed. |
| customer_id | integer | FK (customer) |  | Customer who placed the order (required). |

**Constraints:**

- Check `order_total_non_negative`: `total_cents >= 0`

### Customer

*Table: `customer`*

> A shop customer with an embedded address and a computed display column.

| Column | Type | Key | Nullable | Description |
|--------|------|-----|----------|-------------|
| id | integer | PK |  |  |
| name | string |  |  | Full legal name |
| email | string |  |  | Billing email. |
| name_length | integer |  |  | Number of characters in the name, computed in SQL (no physical column). |
| address_street | string | [Address] |  | Street line. |
| address_city | string | [Address] |  | City name. |
| address_zip_code | string | [Address] | Y | Optional postal / ZIP code. |

**Constraints:**

- Index `customer_name_idx`: (name)
- Unique `customer_email_uq`: (email)

**Computed columns:**

- `name_length`: `LENGTH(name)`