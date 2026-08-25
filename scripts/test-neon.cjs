require("dotenv").config();

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 20000,
});

async function test() {
  try {
    console.log("Connecting to Neon...");
    console.log(
      "Host:",
      new URL(process.env.DATABASE_URL).hostname
    );

    await client.connect();

    const result = await client.query(
      "SELECT current_database(), current_user;"
    );

    console.log("✅ CONNECTED SUCCESSFULLY!");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("❌ CONNECTION FAILED");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

test();