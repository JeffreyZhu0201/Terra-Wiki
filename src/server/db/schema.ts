import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

const uuidPrimaryKey = () => uuid('id').primaryKey().defaultRandom()

export const userRole = pgEnum('user_role', ['admin', 'author'])
export const localePref = pgEnum('locale_pref', ['zh', 'en'])
export const postStatus = pgEnum('post_status', ['draft', 'published', 'archived'])
export const revisionSource = pgEnum('revision_source', ['human', 'agent'])
export const actorType = pgEnum('actor_type', ['user', 'token'])

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export const users = pgTable('users', {
  id: uuidPrimaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: userRole('role').notNull().default('author'),
  localePref: localePref('locale_pref').notNull().default('zh'),
  // 停用后立即无法登录，已有会话也失效。
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sessions = pgTable('sessions', {
  id: uuidPrimaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
})

export const categories = pgTable(
  'categories',
  {
    id: uuidPrimaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    // 物化路径，如 "guide/rust"。子树查询靠它，不用 ltree 扩展。
    path: text('path').notNull(),
    depth: integer('depth').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('categories_parent_slug_unique').on(t.parentId, t.slug)],
)

export const tags = pgTable('tags', {
  id: uuidPrimaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
})

export const posts = pgTable(
  'posts',
  {
    id: uuidPrimaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    bodyMd: text('body_md').notNull().default(''),
    status: postStatus('status').notNull().default('draft'),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    featured: boolean('featured').notNull().default(false),
    coverImage: text('cover_image'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('posts_category_slug_unique').on(t.categoryId, t.slug)],
)

export const postTags = pgTable(
  'post_tags',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] })],
)

export const postRevisions = pgTable('post_revisions', {
  id: uuidPrimaryKey(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  bodyMd: text('body_md').notNull(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  source: revisionSource('source').notNull(),
  createdAt: createdAt(),
})

export const postViewDaily = pgTable(
  'post_view_daily',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    views: integer('views').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.day] })],
)

export const postViewVisitors = pgTable(
  'post_view_visitors',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    // 存的是 sha256(vid + salt)，不是原始访客标识。
    vidHash: text('vid_hash').notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.day, t.vidHash] })],
)

export const mcpTokens = pgTable('mcp_tokens', {
  id: uuidPrimaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  canPublish: boolean('can_publish').notNull().default(false),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
})

export const auditLogs = pgTable('audit_logs', {
  id: uuidPrimaryKey(),
  actorType: actorType('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  meta: jsonb('meta')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
})

export const uploads = pgTable('uploads', {
  id: uuidPrimaryKey(),
  filename: text('filename').notNull(),
  storedPath: text('stored_path').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  uploaderId: uuid('uploader_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
})

export const redirects = pgTable('redirects', {
  id: uuidPrimaryKey(),
  fromPath: text('from_path').notNull().unique(),
  toPath: text('to_path').notNull(),
  httpStatus: integer('http_status').notNull().default(301),
  createdAt: createdAt(),
})

export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
})

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  sessions: many(sessions),
  mcpTokens: many(mcpTokens),
  uploads: many(uploads),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_tree',
  }),
  children: many(categories, { relationName: 'category_tree' }),
  posts: many(posts),
}))

export const postsRelations = relations(posts, ({ one, many }) => ({
  category: one(categories, { fields: [posts.categoryId], references: [categories.id] }),
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  postTags: many(postTags),
  revisions: many(postRevisions),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  postTags: many(postTags),
}))

export const postTagsRelations = relations(postTags, ({ one }) => ({
  post: one(posts, { fields: [postTags.postId], references: [posts.id] }),
  tag: one(tags, { fields: [postTags.tagId], references: [tags.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const mcpTokensRelations = relations(mcpTokens, ({ one }) => ({
  author: one(users, { fields: [mcpTokens.authorId], references: [users.id] }),
}))

export const uploadsRelations = relations(uploads, ({ one }) => ({
  uploader: one(users, { fields: [uploads.uploaderId], references: [users.id] }),
}))

export const postRevisionsRelations = relations(postRevisions, ({ one }) => ({
  post: one(posts, { fields: [postRevisions.postId], references: [posts.id] }),
  author: one(users, { fields: [postRevisions.authorId], references: [users.id] }),
}))
