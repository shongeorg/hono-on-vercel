import { Hono } from "hono";
import { handle } from "hono/vercel";
import postgres from "postgres";
import dotenv from "dotenv";
import slugify from "slugify";

dotenv.config();

const app = new Hono().basePath("/api");

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const sql = postgres({
  host: PGHOST,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
  port: 5432,
  ssl: "require",
});

app.use("*", (c, next) => {
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, PUT, DELETE, OPTIONS"
  );
  c.res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (c.req.method === "OPTIONS") {
    return c.res.sendStatus(204);
  }

  return next();
});

app.get("/", (c) => {
  return c.json({ message: "Congrats! You've deployed Hono to Vercel" });
});

app.get("/posts", async (c) => {
  try {
    const posts = await sql`SELECT * FROM "Post" ORDER BY "update_at" DESC`;
    return c.json(posts);
  } catch (error) {
    console.error("Error fetching posts:", error);
    return c.status(500).json({ error: "Internal server error" });
  }
});

app.post("/posts", async (c) => {
  const { title, content, author } = await c.req.json();
  const slug = slugify(title, { lower: true });
  try {
    const newPost = await sql`
      INSERT INTO "Post" ("post_id", "title", "content", "author", "slug", "create_at")
      VALUES (gen_random_uuid(), ${title}, ${content}, ${author}, ${slug}, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    return c.json(newPost[0]);
  } catch (error) {
    console.error("Error creating post:", error);
    return c.status(500).json({ error: "Internal server error" });
  }
});

app.get("/posts/:postId", async (c) => {
  const { postId } = c.req.param();
  try {
    const post = await sql`SELECT * FROM "Post" WHERE "post_id" = ${postId}`;
    if (post.length === 0) {
      return c.status(404).json({ error: "Post not found" });
    }
    return c.json(post[0]);
  } catch (error) {
    console.error("Error fetching post:", error);
    return c.status(500).json({ error: "Internal server error" });
  }
});

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const OPTIONS = handler;
