# Hono Blog API

Serverless blog API built with **Hono.js**, deployed on **Vercel**, using **Neon PostgreSQL**.

## Features

- 🔐 JWT Authentication (register, login)
- 📝 Full CRUD for Posts & Comments
- 👤 Author-based ownership (users can only edit/delete their own content)
- ✅ Zod validation for all inputs
- 🚀 Serverless deployment on Vercel
- 📦 Neon PostgreSQL database

## Tech Stack

| Technology                                       | Purpose          |
| ------------------------------------------------ | ---------------- |
| [Hono](https://hono.dev/)                        | Web framework    |
| [Vercel](https://vercel.com)                     | Deployment       |
| [Neon PostgreSQL](https://neon.tech)             | Database         |
| [Zod](https://github.com/colinhacks/zod)         | Validation       |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | Password hashing |
| [jose](https://github.com/panva/jose)            | JWT tokens       |

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create `.env` file:

```bash
cp .env.example .env
```

Fill in your values:

```env
PGHOST=your-neon-host
PGDATABASE=your-database-name
PGUSER=your-username
PGPASSWORD=your-password
JWT_SECRET=your-secret-key-min-32-chars
```

### 3. Set up database

Execute `migrations/base.sql` in Neon Console:

1. Open [Neon Console](https://console.neon.tech)
2. Select your project
3. Go to **SQL Editor**
4. Paste contents of `migrations/base.sql`
5. Click **Run**

### 4. Run development server

```bash
npm start
```

API available at: `http://localhost:3001/api`

## API Endpoints

### Authentication

| Method | Endpoint         | Description          | Auth |
| ------ | ---------------- | -------------------- | ---- |
| POST   | `/auth/register` | Register new user    | No   |
| POST   | `/auth/login`    | Login, get JWT token | No   |
| GET    | `/auth/me`       | Get current user     | Yes  |

### Posts

| Method | Endpoint     | Description                | Auth |
| ------ | ------------ | -------------------------- | ---- |
| GET    | `/posts`     | List all posts (paginated) | No   |
| GET    | `/posts/:id` | Get single post            | No   |
| POST   | `/posts`     | Create new post            | Yes  |
| PATCH  | `/posts/:id` | Update post (owner only)   | Yes  |
| DELETE | `/posts/:id` | Delete post (owner only)   | Yes  |
| GET    | `/my/posts`  | Get author's posts         | Yes  |

### Comments

| Method | Endpoint                   | Description            | Auth |
| ------ | -------------------------- | ---------------------- | ---- |
| GET    | `/posts/:id/comments`      | Get post comments      | No   |
| POST   | `/posts/:id/comments`      | Create comment         | Yes  |
| PATCH  | `/posts/:id/comments/:cid` | Update comment (owner) | Yes  |
| DELETE | `/posts/:id/comments/:cid` | Delete comment (owner) | Yes  |
| GET    | `/my/comments`             | Get author's comments  | Yes  |

## Usage Examples

### Register

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","name":"John Doe"}'
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

### Create Post

```bash
curl -X POST http://localhost:3001/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"title":"My Post","content":"Post content here"}'
```

### Get Posts

```bash
curl http://localhost:3001/api/posts
```

## Testing

All API requests are documented in `blog.http`. Open it in VS Code with REST Client extension to test endpoints interactively.

## Database Schema

```
author
├── author_id (UUID, PK)
├── email (TEXT, UNIQUE)
├── password (TEXT, hashed)
├── name (TEXT)
└── timestamps

post
├── post_id (UUID, PK)
├── title (TEXT)
├── content (TEXT)
├── author_id (UUID, FK → author)
├── slug (TEXT)
└── timestamps

comment
├── comment_id (UUID, PK)
├── post_id (UUID, FK → post)
├── author_id (UUID, FK → author)
├── content (TEXT)
└── timestamps
```

## Deploy to Vercel

### 1. Add environment variables

```bash
npx vercel env add PGHOST
npx vercel env add PGDATABASE
npx vercel env add PGUSER
npx vercel env add PGPASSWORD
npx vercel env add JWT_SECRET
```

Or add them in Vercel Dashboard: **Settings** → **Environment Variables**

### 2. Deploy

```bash
npm run deploy
```

## Project Structure

```
hono-on-vercel/
├── api/
│   └── index.js          # Main API file
├── migrations/
│   └── base.sql          # Database schema
├── seeds/
│   └── fake-authors.js   # Seed fake users
├── blog.http             # REST Client requests
├── .env.example          # Environment template
├── package.json
└── vercel.json           # Vercel config
```

## License

MIT
