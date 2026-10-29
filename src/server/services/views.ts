import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { postViewDaily, postViewVisitors } from '../db/schema'
import { sha256 } from '../crypto'

/**
 * 记一次浏览。同一访客同一天只算一次——
 * 去重靠 post_view_visitors 的主键（post_id, day, vid_hash）。
 * 返回 true 表示这次真的计了新的一次。
 */
export async function trackView(input: { postId: string; vid: string }): Promise<boolean> {
  const salt = process.env.VID_SALT ?? ''
  const vidHash = sha256(`${input.vid}${salt}`)
  const day = new Date().toISOString().slice(0, 10)

  const inserted = await db
    .insert(postViewVisitors)
    .values({ postId: input.postId, day, vidHash })
    .onConflictDoNothing()
    .returning({ postId: postViewVisitors.postId })

  if (inserted.length === 0) return false

  await db
    .insert(postViewDaily)
    .values({ postId: input.postId, day, views: 1 })
    .onConflictDoUpdate({
      target: [postViewDaily.postId, postViewDaily.day],
      set: { views: sql`${postViewDaily.views} + 1` },
    })

  return true
}

/** 累计浏览次数。 */
export async function getViewCount(postId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${postViewDaily.views}), 0)` })
    .from(postViewDaily)
    .where(eq(postViewDaily.postId, postId))
  return Number(row?.total ?? 0)
}
