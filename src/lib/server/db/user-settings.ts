import { eq } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { db } from './index.ts';
import { sql } from 'drizzle-orm';

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id').notNull().primaryKey(),
  soundEnabled: integer('sound_enabled', { mode: 'boolean' }).default(true).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull()
});

export const getUserSetting = async (userId: string, key: string): Promise<boolean> => {
  if (key !== 'soundEnabled') return true;
  
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (rows.length === 0) return true;
  
  return rows[0]?.soundEnabled ?? true;
};

export const setUserSetting = async (userId: string, key: string, value: boolean): Promise<void> => {
  if (key !== 'soundEnabled') return;
  
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  
  if (existing.length === 0) {
    await db.insert(userSettings).values({
      userId,
      soundEnabled: value,
    });
  } else {
    await db.update(userSettings)
      .set({ soundEnabled: value, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .run();
  }
};
