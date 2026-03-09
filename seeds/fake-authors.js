import postgres from "postgres";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const sql = postgres({
  host: PGHOST,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
  port: 5432,
  ssl: "require",
});

async function seedFakeAuthors() {
  const authors = [];
  const hashedPassword = await bcrypt.hash("password1", 10);

  for (let i = 1; i <= 10; i++) {
    authors.push({
      email: `author${i}@test.com`,
      password: hashedPassword,
      name: `Author ${i}`,
    });
  }

  try {
    // Insert authors (ignore if exists)
    for (const author of authors) {
      await sql`
        INSERT INTO author (email, password, name)
        VALUES (${author.email}, ${author.password}, ${author.name})
        ON CONFLICT (email) DO NOTHING
      `;
      console.log(`Created: ${author.email}`);
    }

    console.log("\n✅ Seeded 10 fake authors!");
    console.log("\nLogin credentials:");
    console.log("  Email: author1@test.com - author10@test.com");
    console.log("  Password: password1");

    await sql.end();
  } catch (error) {
    console.error("Error seeding authors:", error);
    await sql.end();
    process.exit(1);
  }
}

seedFakeAuthors();
