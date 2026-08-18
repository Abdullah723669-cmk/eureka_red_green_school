require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Seed default data if database is empty
async function seedInitialData() {
  const studentCount = await prisma.student.count();
  if (studentCount === 0) {
    console.log("Seeding default school dataset to Prisma SQLite database...");
    
    await prisma.student.createMany({
      data: [
        { studentId: 106, name: "Abdullah", grade: "Grade 2", guardian: "01711223344", status: "Active", feesPaid: 150, attendedDays: 19, totalDays: 20 },
        { studentId: 102, name: "Tarik Hasan", grade: "Grade 3", guardian: "01811223344", status: "Active", feesPaid: 200, attendedDays: 18, totalDays: 20 },
        { studentId: 103, name: "Zubair Ahmed", grade: "Grade 1", guardian: "01911223344", status: "Pending Fee", feesPaid: 0, attendedDays: 16, totalDays: 20 },
        { studentId: 104, name: "Nabila Chowdhury", grade: "Grade 2", guardian: "01511223344", status: "Active", feesPaid: 150, attendedDays: 20, totalDays: 20 }
      ]
    });

    await prisma.staff.createMany({
      data: [
        { staffId: 1, name: "Rashid Khan", role: "Class Teacher (Grade 2)", phone: "01700112233" },
        { staffId: 2, name: "Nusrat Jahan", role: "Math Specialist", phone: "01800112233" },
        { staffId: 3, name: "Kamal Hossain", role: "Support & Maintenance", phone: "01900112233" }
      ]
    });

    await prisma.grade.createMany({
      data: [
        { studentId: 106, subject: "Mathematics", score: 92, term: "Mid Term 1" },
        { studentId: 106, subject: "English", score: 85, term: "Mid Term 1" },
        { studentId: 106, subject: "Science", score: 88, term: "Mid Term 1" },
        { studentId: 102, subject: "Mathematics", score: 78, term: "Mid Term 1" },
        { studentId: 102, subject: "English", score: 82, term: "Mid Term 1" },
        { studentId: 102, subject: "Science", score: 80, term: "Mid Term 1" }
      ]
    });

    await prisma.expense.createMany({
      data: [
        { category: "House Rent", amount: 500, date: "2026-08-01", notes: "August Campus Rent" },
        { category: "Electricity Bill", amount: 120, date: "2026-08-10", notes: "Monthly Power Bill" },
        { category: "Stationary Purchase Cost", amount: 45, date: "2026-08-15", notes: "Exam Papers & Markers" },
        { category: "Snacks Bill", amount: 30, date: "2026-08-18", notes: "Staff Refreshments" }
      ]
    });

    await prisma.notice.createMany({
      data: [
        { title: "Independence Cultural Week", content: "Preparations start next Monday. Parents are invited for art showcase.", date: "Aug 14, 2026" },
        { title: "Term 2 Examination Schedule", content: "Final examinations start from September 10th. Routine published.", date: "Aug 12, 2026" }
      ]
    });
  }
}

// 1. Get All Data
app.get('/api/data', async (req, res) => {
  try {
    const studentsDb = await prisma.student.findMany({ orderBy: { studentId: 'asc' } });
    const staffDb = await prisma.staff.findMany();
    const grades = await prisma.grade.findMany();
    const transactions = await prisma.transaction.findMany({ orderBy: { id: 'desc' } });
    const expenses = await prisma.expense.findMany({ orderBy: { id: 'desc' } });
    const notices = await prisma.notice.findMany({ orderBy: { id: 'desc' } });

    const students = studentsDb.map(s => ({
      id: s.studentId,
      name: s.name,
      grade: s.grade,
      guardian: s.guardian,
      status: s.status,
      feesPaid: s.feesPaid,
      attendedDays: s.attendedDays,
      totalDays: s.totalDays
    }));

    const staff = staffDb.map(st => ({
      id: st.staffId,
      name: st.name,
      role: st.role,
      phone: st.phone
    }));

    res.json({ students, staff, grades, transactions, expenses, notices });
  } catch (err) {
    console.error("Error fetching Prisma DB data:", err);
    res.status(500).json({ error: "Failed to read database" });
  }
});

// 2. Add Pupil
app.post('/api/students', async (req, res) => {
  try {
    const { id, name, grade, guardian, status, feesPaid, attendedDays, totalDays } = req.body;
    const newStudent = await prisma.student.create({
      data: {
        studentId: id,
        name,
        grade,
        guardian,
        status: status || "Active",
        feesPaid: feesPaid || 0,
        attendedDays: attendedDays || 20,
        totalDays: totalDays || 20
      }
    });
    res.json({ success: true, student: newStudent });
  } catch (err) {
    console.error("Error adding student:", err);
    res.status(500).json({ error: "Failed to add student" });
  }
});

// 3. Add Staff
app.post('/api/staff', async (req, res) => {
  try {
    const { id, name, role, phone } = req.body;
    const newStaff = await prisma.staff.create({
      data: { staffId: id, name, role, phone }
    });
    res.json({ success: true, staff: newStaff });
  } catch (err) {
    console.error("Error adding staff:", err);
    res.status(500).json({ error: "Failed to add staff" });
  }
});

// 4. Record Fee Payment
app.post('/api/fees', async (req, res) => {
  try {
    const { studentName, studentId, amount, type, date } = req.body;
    const tx = await prisma.transaction.create({
      data: { studentName, studentId, amount, type, date }
    });
    
    // Update student fees in DB
    const student = await prisma.student.findUnique({ where: { studentId } });
    if (student) {
      await prisma.student.update({
        where: { studentId },
        data: { feesPaid: student.feesPaid + amount, status: "Active" }
      });
    }

    res.json({ success: true, transaction: tx });
  } catch (err) {
    console.error("Error recording fee:", err);
    res.status(500).json({ error: "Failed to record fee" });
  }
});

// 5. Record Expense
app.post('/api/expenses', async (req, res) => {
  try {
    const { category, amount, date, notes } = req.body;
    const exp = await prisma.expense.create({
      data: { category, amount, date, notes }
    });
    res.json({ success: true, expense: exp });
  } catch (err) {
    console.error("Error recording expense:", err);
    res.status(500).json({ error: "Failed to record expense" });
  }
});

// 6. Broadcast Notice
app.post('/api/notices', async (req, res) => {
  try {
    const { title, content, date } = req.body;
    const notice = await prisma.notice.create({
      data: { title, content, date }
    });
    res.json({ success: true, notice });
  } catch (err) {
    console.error("Error adding notice:", err);
    res.status(500).json({ error: "Failed to add notice" });
  }
});

// 7. Save Grade Entry
app.post('/api/grades', async (req, res) => {
  try {
    const { studentId, subject, score, term } = req.body;
    const grade = await prisma.grade.create({
      data: { studentId, subject, score, term }
    });
    res.json({ success: true, grade });
  } catch (err) {
    console.error("Error adding grade:", err);
    res.status(500).json({ error: "Failed to add grade" });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Eureka School Prisma Server running on http://localhost:${PORT}`);
  try {
    await seedInitialData();
  } catch (e) {
    console.warn("Seeding notice:", e.message);
  }
});
