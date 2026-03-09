-- Міграція 001: Додавання таблиці author та авторизації
-- Виконати в Neon Console або через psql

-- 1. Створюємо таблицю author
CREATE TABLE IF NOT EXISTS "author" (
  "author_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT UNIQUE NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "create_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "update_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Додаємо author_id до post та comment (спочатку як nullable)
ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "author_id" UUID REFERENCES "author"("author_id");
ALTER TABLE "comment" ADD COLUMN IF NOT EXISTS "author_id" UUID REFERENCES "author"("author_id");

-- 3. Створюємо тимчасових авторів з унікальних імен (пароль - placeholder)
INSERT INTO "author" ("email", "password", "name")
SELECT DISTINCT 
  LOWER(REPLACE("author", ' ', '_') || '@temp.local') as email,
  '$2a$10$TEMP_PASSWORD_NEEDS_RESET' as password,
  "author" as name
FROM "post"
WHERE "author" IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- 4. Прив'язуємо пости до авторів по імені
UPDATE "post" p
SET "author_id" = a."author_id"
FROM "author" a
WHERE p."author" = a."name" AND p."author_id" IS NULL;

-- 5. Прив'язуємо коментарі до авторів по імені
UPDATE "comment" c
SET "author_id" = a."author_id"
FROM "author" a
WHERE c."author" = a."name" AND c."author_id" IS NULL;

-- 6. Робимо author_id NOT NULL (якщо всі записи мігровані)
ALTER TABLE "post" ALTER COLUMN "author_id" SET NOT NULL;
ALTER TABLE "comment" ALTER COLUMN "author_id" SET NOT NULL;

-- 7. Додаємо індекси для продуктивності
CREATE INDEX IF NOT EXISTS "idx_post_author" ON "post"("author_id");
CREATE INDEX IF NOT EXISTS "idx_comment_author" ON "comment"("author_id");
CREATE INDEX IF NOT EXISTS "idx_comment_post" ON "comment"("post_id");
CREATE INDEX IF NOT EXISTS "idx_author_email" ON "author"("email");

-- 8. Додаємо сесії для JWT токенів (опціонально, для blacklist)
CREATE TABLE IF NOT EXISTS "session" (
  "session_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "author_id" UUID NOT NULL REFERENCES "author"("author_id") ON DELETE CASCADE,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "create_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_session_author" ON "session"("author_id");
CREATE INDEX IF NOT EXISTS "idx_session_expires" ON "session"("expires_at");
