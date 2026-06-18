import { SqliteDriver } from '@mikro-orm/sqlite';
import { Address } from './entities/Address.js';
import { Animal } from './entities/Animal.js';
import { AuditLog } from './entities/AuditLog.js';
import { Cat } from './entities/Cat.js';
import { Comment } from './entities/Comment.js';
import { Customer } from './entities/Customer.js';
import { DailyStats } from './entities/DailyStats.js';
import { Dog } from './entities/Dog.js';
import { Order } from './entities/Order.js';
import { OrderItem } from './entities/OrderItem.js';
import { Post } from './entities/Post.js';
import { Product } from './entities/Product.js';
import { Profile } from './entities/Profile.js';
import { ReportSettings } from './entities/ReportSettings.js';
import { Tag } from './entities/Tag.js';
import { User } from './entities/User.js';

// In-memory SQLite is enough for documentation generation: the tool only reads
// entity metadata and never connects to the database.
export default {
  driver: SqliteDriver,
  dbName: ':memory:',
  entities: [
    User,
    Profile,
    Post,
    Tag,
    Comment,
    Address,
    Customer,
    Product,
    Order,
    OrderItem,
    Animal,
    Dog,
    Cat,
    AuditLog,
    DailyStats,
    ReportSettings,
  ],
  debug: false,
};
