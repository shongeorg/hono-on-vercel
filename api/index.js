import { Hono } from "hono";
import { handle } from "hono/vercel";
import { jwtVerify, SignJWT } from "jose";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import postgres from "postgres";
import dotenv from "dotenv";
import slugify from "slugify";
import bcrypt from "bcryptjs";

dotenv.config();

const app = new Hono().basePath("/api");

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not set in environment variables!");
}

const sql = postgres({
  host: PGHOST,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
  port: 5432,
  ssl: "require",
});

const JWT_ISSUER = "hono-blog";
const JWT_AUDIENCE = "hono-blog-users";

// ==================== ZOD SCHEMAS ====================

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const createPostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long (max 200)"),
  content: z.string().min(1, "Content is required"),
});

const updatePostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long (max 200)"),
  content: z.string().min(1, "Content is required"),
});

const createCommentSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

const updateCommentSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

const paginationSchema = z.object({
  page: z.string().optional().default("1"),
});

// ==================== HELPERS ====================

const generateToken = async (payload) => {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(new TextEncoder().encode(JWT_SECRET));
};

const verifyToken = async (token) => {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );
    return payload;
  } catch {
    return null;
  }
};

const getBearerToken = (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
};

// ==================== MIDDLEWARE ====================

// CORS middleware
app.use("*", (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return next();
});

// Auth middleware - optional
const optionalAuth = async (c, next) => {
  const token = getBearerToken(c);
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      c.set("author", {
        authorId: payload.sub,
        email: payload.email,
      });
    }
  }
  await next();
};

// Auth middleware - required
const requireAuth = async (c, next) => {
  const token = getBearerToken(c);
  if (!token) {
    return c.json({ error: "Authorization required" }, 401);
  }
  const payload = await verifyToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  c.set("author", {
    authorId: payload.sub,
    email: payload.email,
  });
  await next();
};

// ==================== PUBLIC ROUTES ====================

app.get("/", (c) => {
  return c.json({ message: "Congrats! You've deployed Hono to Vercel" });
});

// Get all posts (public)
app.get(
  "/posts",
  zValidator("query", paginationSchema),
  async (c) => {
    const { page } = c.req.valid("query");
    const pageNum = parseInt(page);
    const limit = 10;
    const offset = (pageNum - 1) * limit;

    const [{ count }] = await sql`SELECT COUNT(*) FROM post`;
    const totalRows = parseInt(count);
    const totalPages = Math.ceil(totalRows / limit);

    const posts = await sql`
      SELECT p.*, a.name as "authorName", a.email as "authorEmail"
      FROM post p
      LEFT JOIN author a ON p.author_id = a.author_id
      ORDER BY p.update_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return c.json({
      firstPage: 1,
      lastPage: totalPages,
      nextPage: pageNum < totalPages ? pageNum + 1 : null,
      prevPage: pageNum > 1 ? pageNum - 1 : null,
      posts,
      pages: totalPages,
    });
  }
);

// Get single post by ID (public)
app.get("/posts/:postId", async (c) => {
  const { postId } = c.req.param();
  const post = await sql`
    SELECT p.*, a.name as "authorName", a.email as "authorEmail"
    FROM post p
    LEFT JOIN author a ON p.author_id = a.author_id
    WHERE p.post_id = ${postId}
  `;
  
  if (post.length === 0) {
    return c.status(404).json({ error: "Post not found" });
  }
  return c.json(post[0]);
});

// Get comments for a post (public)
app.get("/posts/:postId/comments", async (c) => {
  const { postId } = c.req.param();
  const comments = await sql`
    SELECT c.*, a.name as "authorName"
    FROM comment c
    LEFT JOIN author a ON c.author_id = a.author_id
    WHERE c.post_id = ${postId}
    ORDER BY c.create_at ASC
  `;
  return c.json(comments);
});

// ==================== AUTH ROUTES ====================

// Register
app.post(
  "/auth/register",
  zValidator("json", registerSchema),
  async (c) => {
    const { email, password, name } = c.req.valid("json");

    try {
      // Check if user exists
      const existing = await sql`
        SELECT * FROM author WHERE email = ${email.toLowerCase()}
      `;

      if (existing.length > 0) {
        return c.status(409).json({ error: "User with this email already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const result = await sql`
        INSERT INTO author (email, password, name)
        VALUES (${email.toLowerCase()}, ${hashedPassword}, ${name})
        RETURNING author_id, email, name, create_at
      `;

      const author = result[0];

      // Generate JWT
      const token = await generateToken({
        sub: author.author_id,
        email: author.email,
        name: author.name,
      });

      return c.json({
        message: "Registration successful",
        author: {
          authorId: author.author_id,
          email: author.email,
          name: author.name,
        },
        token,
      }, 201);
    } catch (error) {
      console.error("Error registering user:", error);
      return c.status(500).json({ error: "Internal server error" });
    }
  }
);

// Login
app.post(
  "/auth/login",
  zValidator("json", loginSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");

    try {
      const users = await sql`
        SELECT * FROM author WHERE email = ${email.toLowerCase()}
      `;

      if (users.length === 0) {
        return c.status(401).json({ error: "Invalid email or password" });
      }

      const user = users[0];

      // Verify password
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        return c.status(401).json({ error: "Invalid email or password" });
      }

      // Generate JWT
      const token = await generateToken({
        sub: user.author_id,
        email: user.email,
        name: user.name,
      });

      return c.json({
        message: "Login successful",
        author: {
          authorId: user.author_id,
          email: user.email,
          name: user.name,
        },
        token,
      });
    } catch (error) {
      console.error("Error logging in user:", error);
      return c.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get current user profile
app.get("/auth/me", optionalAuth, async (c) => {
  const author = c.get("author");
  if (!author) {
    return c.status(401).json({ error: "Not authenticated" });
  }

  const user = await sql`
    SELECT author_id, email, name, create_at
    FROM author
    WHERE author_id = ${author.authorId}
  `;

  if (user.length === 0) {
    return c.status(404).json({ error: "User not found" });
  }

  return c.json(user[0]);
});

// ==================== PROTECTED ROUTES (POSTS) ====================

// Create post (requires auth)
app.post(
  "/posts",
  requireAuth,
  zValidator("json", createPostSchema),
  async (c) => {
    const author = c.get("author");
    const { title, content } = c.req.valid("json");

    const slug = slugify(title, { lower: true });

    try {
      const newPost = await sql`
        INSERT INTO post (post_id, title, content, author_id, slug, create_at)
        VALUES (gen_random_uuid(), ${title}, ${content}, ${author.authorId}, ${slug}, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      return c.json(newPost[0], 201);
    } catch (error) {
      console.error("Error creating post:", error);
      return c.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update post (requires auth + ownership check)
app.patch(
  "/posts/:postId",
  requireAuth,
  zValidator("json", updatePostSchema),
  async (c) => {
    const author = c.get("author");
    const { postId } = c.req.param();
    const { title, content } = c.req.valid("json");

    try {
      // Check ownership
      const existing = await sql`
        SELECT * FROM post WHERE post_id = ${postId} AND author_id = ${author.authorId}
      `;

      if (existing.length === 0) {
        return c.status(404).json({ error: "Post not found or you don't have permission" });
      }

      const slug = slugify(title, { lower: true });

      const result = await sql`
        UPDATE post
        SET title = ${title}, content = ${content}, slug = ${slug}, update_at = CURRENT_TIMESTAMP
        WHERE post_id = ${postId}
        RETURNING *
      `;

      return c.json({
        message: "Post updated successfully",
        updatedPost: result[0],
      });
    } catch (error) {
      console.error("Error updating post:", error);
      return c.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete post (requires auth + ownership check)
app.delete("/posts/:postId", requireAuth, async (c) => {
  const author = c.get("author");
  const { postId } = c.req.param();

  try {
    // Check ownership
    const existing = await sql`
      SELECT * FROM post WHERE post_id = ${postId} AND author_id = ${author.authorId}
    `;

    if (existing.length === 0) {
      return c.status(404).json({ error: "Post not found or you don't have permission" });
    }

    const result = await sql`
      DELETE FROM post WHERE post_id = ${postId} RETURNING *
    `;

    return c.json({
      message: "Post deleted successfully",
      deletedPost: result[0],
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    return c.status(500).json({ error: "Internal server error" });
  }
});

// ==================== PROTECTED ROUTES (COMMENTS) ====================

// Create comment (requires auth)
app.post(
  "/posts/:postId/comments",
  requireAuth,
  zValidator("json", createCommentSchema),
  async (c) => {
    const author = c.get("author");
    const { postId } = c.req.param();
    const { content } = c.req.valid("json");

    try {
      // Verify post exists
      const post = await sql`SELECT * FROM post WHERE post_id = ${postId}`;
      if (post.length === 0) {
        return c.status(404).json({ error: "Post not found" });
      }

      const newComment = await sql`
        INSERT INTO comment (comment_id, post_id, content, author_id, create_at)
        VALUES (gen_random_uuid(), ${postId}, ${content}, ${author.authorId}, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      return c.json(newComment[0], 201);
    } catch (error) {
      console.error("Error creating comment:", error);
      return c.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update comment (requires auth + ownership)
app.patch(
  "/posts/:postId/comments/:commentId",
  requireAuth,
  zValidator("json", updateCommentSchema),
  async (c) => {
    const author = c.get("author");
    const { commentId } = c.req.param();
    const { content } = c.req.valid("json");

    try {
      const result = await sql`
        UPDATE comment
        SET content = ${content}, update_at = CURRENT_TIMESTAMP
        WHERE comment_id = ${commentId} AND author_id = ${author.authorId}
        RETURNING *
      `;

      if (result.length === 0) {
        return c.status(404).json({ error: "Comment not found or you don't have permission" });
      }

      return c.json(result[0]);
    } catch (error) {
      console.error("Error updating comment:", error);
      return c.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete comment (requires auth + ownership)
app.delete("/posts/:postId/comments/:commentId", requireAuth, async (c) => {
  const author = c.get("author");
  const { commentId } = c.req.param();

  try {
    const result = await sql`
      DELETE FROM comment 
      WHERE comment_id = ${commentId} AND author_id = ${author.authorId} 
      RETURNING *
    `;

    if (result.length === 0) {
      return c.status(404).json({ error: "Comment not found or you don't have permission" });
    }

    return c.json({ message: "Comment deleted" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return c.status(500).json({ error: "Internal server error" });
  }
});

// Get author's own posts
app.get("/my/posts", requireAuth, async (c) => {
  const author = c.get("author");
  
  const posts = await sql`
    SELECT * FROM post
    WHERE author_id = ${author.authorId}
    ORDER BY update_at DESC
  `;

  return c.json(posts);
});

// Get author's own comments
app.get("/my/comments", requireAuth, async (c) => {
  const author = c.get("author");
  
  const comments = await sql`
    SELECT c.*, p.title as "postTitle"
    FROM comment c
    LEFT JOIN post p ON c.post_id = p.post_id
    WHERE c.author_id = ${author.authorId}
    ORDER BY c.create_at DESC
  `;

  return c.json(comments);
});

// ==================== ERROR HANDLING ====================

// Global error handler for zod validation
app.onError((err, c) => {
  if (err.name === "ZodError") {
    const errors = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    return c.json({ error: "Validation failed", details: errors }, 400);
  }
  
  console.error("Unexpected error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ==================== EXPORT HANDLERS ====================

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
export const OPTIONS = handler;
