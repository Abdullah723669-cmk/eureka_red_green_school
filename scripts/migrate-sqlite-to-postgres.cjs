require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const JSON_DB_PATH = path.join(__dirname, '..', 'database', 'school_db.json');

async function migrateData() {
  console.log("🚀 Starting Data Migration to Cloud PostgreSQL...\n");

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("npg_sample_password")) {
    console.error("❌ ERROR: Valid DATABASE_URL is not set in your .env file.");
    console.error("Please add your Cloud PostgreSQL connection string (from Neon.tech or Supabase) to g:\\Eureka\\.env\n");
    process.exit(1);
  }

  let sourceData = { students: [], staff: [], grades: [], transactions: [], expenses: [], notices: [], attendance: {} };

  if (fs.existsSync(JSON_DB_PATH)) {
    console.log(`📁 Found local dataset at: ${JSON_DB_PATH}`);
    try {
      const raw = fs.readFileSync(JSON_DB_PATH, 'utf-8');
      sourceData = JSON.parse(raw);
    } catch (e) {
      console.warn("⚠️ Failed to parse local JSON database file:", e.message);
    }
  }

  try {
    // 1. Migrate Students
    if (sourceData.students && sourceData.students.length > 0) {
      console.log(`⏳ Migrating ${sourceData.students.length} Student records...`);
      for (const s of sourceData.students) {
        await prisma.student.upsert({
          where: { studentId: s.id },
          update: {
            name: s.name,
            grade: s.grade,
            guardian: s.guardian,
            status: s.status || "Active",
            feesPaid: s.feesPaid || 0,
            attendedDays: s.attendedDays || 20,
            totalDays: s.totalDays || 20,
            joiningDate: s.joiningDate || "2024-01-10",
            leavingDate: s.leavingDate || null
          },
          create: {
            studentId: s.id,
            name: s.name,
            grade: s.grade,
            guardian: s.guardian,
            status: s.status || "Active",
            feesPaid: s.feesPaid || 0,
            attendedDays: s.attendedDays || 20,
            totalDays: s.totalDays || 20,
            joiningDate: s.joiningDate || "2024-01-10",
            leavingDate: s.leavingDate || null
          }
        });
      }
      console.log("✅ Students migrated successfully.");
    }

    // 2. Migrate Staff
    if (sourceData.staff && sourceData.staff.length > 0) {
      console.log(`⏳ Migrating ${sourceData.staff.length} Staff records...`);
      for (const st of sourceData.staff) {
        await prisma.staff.upsert({
          where: { staffId: st.id },
          update: {
            name: st.name,
            role: st.role,
            phone: st.phone,
            joiningDate: st.joiningDate || "2023-01-15",
            leavingDate: st.leavingDate || null
          },
          create: {
            staffId: st.id,
            name: st.name,
            role: st.role,
            phone: st.phone,
            joiningDate: st.joiningDate || "2023-01-15",
            leavingDate: st.leavingDate || null
          }
        });
      }
      console.log("✅ Staff migrated successfully.");
    }

    // 3. Migrate Grades
    if (sourceData.grades && sourceData.grades.length > 0) {
      console.log(`⏳ Migrating ${sourceData.grades.length} Grade records...`);
      for (const g of sourceData.grades) {
        await prisma.grade.create({
          data: {
            studentId: g.studentId,
            subject: g.subject,
            score: g.score,
            term: g.term
          }
        });
      }
      console.log("✅ Grades migrated successfully.");
    }

    // 4. Migrate Transactions
    if (sourceData.transactions && sourceData.transactions.length > 0) {
      console.log(`⏳ Migrating ${sourceData.transactions.length} Transaction records...`);
      for (const tx of sourceData.transactions) {
        await prisma.transaction.create({
          data: {
            studentName: tx.studentName || "Student",
            studentId: tx.studentId,
            amount: tx.amount,
            type: tx.type,
            date: tx.date || new Date().toISOString().split('T')[0]
          }
        });
      }
      console.log("✅ Transactions migrated successfully.");
    }

    // 5. Migrate Expenses
    if (sourceData.expenses && sourceData.expenses.length > 0) {
      console.log(`⏳ Migrating ${sourceData.expenses.length} Expense records...`);
      for (const ex of sourceData.expenses) {
        await prisma.expense.create({
          data: {
            category: ex.category,
            amount: ex.amount,
            date: ex.date || new Date().toISOString().split('T')[0],
            notes: ex.notes || null
          }
        });
      }
      console.log("✅ Expenses migrated successfully.");
    }

    // 6. Migrate Notices
    if (sourceData.notices && sourceData.notices.length > 0) {
      console.log(`⏳ Migrating ${sourceData.notices.length} Notice records...`);
      for (const n of sourceData.notices) {
        await prisma.notice.create({
          data: {
            title: n.title,
            content: n.content,
            date: n.date || new Date().toLocaleDateString()
          }
        });
      }
      console.log("✅ Notices migrated successfully.");
    }

    console.log("\n🎉 Data migration to Cloud PostgreSQL completed successfully!");

  } catch (error) {
    console.error("\n❌ Data migration failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateData();
