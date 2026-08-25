// Run with: node scripts/create-lesson-table.cjs
// Uses Neon HTTP serverless driver to create the Lesson table without needing port 5432
require('dotenv').config();

const https = require('https');
const connString = process.env.DATABASE_URL;

if (!connString) {
  console.error('❌ DATABASE_URL not set in .env');
  process.exit(1);
}

const url = new URL(connString);
const host = url.hostname;
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);

const sql = `CREATE TABLE IF NOT EXISTS "Lesson" (
  "id"          SERIAL PRIMARY KEY,
  "grade"       TEXT NOT NULL,
  "subject"     TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "fileType"    TEXT NOT NULL DEFAULT 'link',
  "fileUrl"     TEXT,
  "postedBy"    TEXT NOT NULL DEFAULT 'Teacher',
  "date"        TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

const body = JSON.stringify({ query: sql });
const auth = Buffer.from(`${user}:${password}`).toString('base64');

const options = {
  hostname: host,
  path: '/sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${auth}`,
    'Content-Length': Buffer.byteLength(body)
  }
};

console.log(`Connecting to: ${host}`);

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log(`HTTP Status: ${res.statusCode}`);
    console.log(`Response: ${data}`);
    if (res.statusCode === 200) {
      console.log('✅ Lesson table created/verified successfully');
    } else {
      console.log('❌ Failed — check credentials or endpoint');
    }
  });
});

req.on('error', (e) => console.error('❌ Request error:', e.message));
req.write(body);
req.end();
