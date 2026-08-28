require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- 1. Testing Prisma Connection to Neon PostgreSQL ---");
  const testLesson = await prisma.lesson.create({
    data: {
      grade: "Grade 2",
      subject: "Mathematics",
      title: "Test Lesson for Verification",
      description: "Testing neon database persistence for lessons",
      fileType: "pdf",
      fileUrl: "https://example.com/test.pdf",
      postedBy: "Teacher Test",
      date: new Date().toISOString().split('T')[0],
      publishStatus: "Published"
    }
  });

  console.log("✅ Created test lesson in Neon:", testLesson);

  console.log("--- 2. Querying all lessons from Neon PostgreSQL ---");
  const allLessons = await prisma.lesson.findMany({ orderBy: { id: 'desc' } });
  console.log(`Found ${allLessons.length} lessons in Neon DB`);
  const found = allLessons.find(l => l.id === testLesson.id);
  if (!found) {
    throw new Error("Created test lesson could not be found!");
  }
  console.log("✅ Found lesson:", found);

  console.log("--- 3. Cleaning up test lesson ---");
  await prisma.lesson.delete({ where: { id: testLesson.id } });
  console.log("✅ Deleted test lesson from Neon successfully!");
}

run()
  .catch(err => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
