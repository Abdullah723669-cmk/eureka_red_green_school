require("dotenv").config();

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});

async function test() {
  try {
    console.log("Connecting to Neon...");
    await client.connect();

    console.log("✅ PostgreSQL connection successful!");

    const result = await client.query(
      "SELECT current_database(), current_user"
    );

    console.log(result.rows[0]);
  } catch (error) {
    console.error("❌ PostgreSQL connection failed:");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
    console.error(error);
  } finally {
    await client.end().catch(() => {});
  }
}

test();