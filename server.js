import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
      totalDays: s.totalDays,
      joiningDate: s.joiningDate,
      leavingDate: s.leavingDate || ''
    }));

    const staff = staffDb.map(st => ({
      id: st.staffId,
      name: st.name,
      role: st.role,
      phone: st.phone,
      joiningDate: st.joiningDate,
      leavingDate: st.leavingDate || ''
    }));

    res.json({ students, staff, grades, transactions, expenses, notices });
  } catch (err) {
    console.error("Error fetching PostgreSQL DB data:", err);
    res.status(500).json({ error: "Failed to read database from PostgreSQL" });
  }
});

// 2. Add Student / Enroll Student
app.post('/api/students', async (req, res) => {
  try {
    const { id, name, grade, guardian, status, feesPaid, attendedDays, totalDays, joiningDate, leavingDate } = req.body;
    const newStudent = await prisma.student.create({
      data: {
        studentId: Number(id),
        name,
        grade,
        guardian,
        status: status || "Active",
        feesPaid: feesPaid ? Number(feesPaid) : 0,
        attendedDays: attendedDays ? Number(attendedDays) : 20,
        totalDays: totalDays ? Number(totalDays) : 20,
        joiningDate: joiningDate || "2024-01-10",
        leavingDate: leavingDate || null
      }
    });
    res.json({ success: true, student: newStudent });
  } catch (err) {
    console.error("Error adding student to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to add student" });
  }
});

// 3. Add Staff
app.post('/api/staff', async (req, res) => {
  try {
    const { id, name, role, phone, joiningDate, leavingDate } = req.body;
    const newStaff = await prisma.staff.create({
      data: {
        staffId: Number(id),
        name,
        role,
        phone,
        joiningDate: joiningDate || "2023-01-15",
        leavingDate: leavingDate || null
      }
    });
    res.json({ success: true, staff: newStaff });
  } catch (err) {
    console.error("Error adding staff to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to add staff" });
  }
});

// 4. Record Fee Payment
app.post('/api/fees', async (req, res) => {
  try {
    const { studentName, studentId, amount, type, date } = req.body;
    const tx = await prisma.transaction.create({
      data: { studentName, studentId: Number(studentId), amount: Number(amount), type, date }
    });
    
    // Update student fees in PostgreSQL
    const student = await prisma.student.findUnique({ where: { studentId: Number(studentId) } });
    if (student) {
      await prisma.student.update({
        where: { studentId: Number(studentId) },
        data: { feesPaid: student.feesPaid + Number(amount), status: "Active" }
      });
    }

    res.json({ success: true, transaction: tx });
  } catch (err) {
    console.error("Error recording fee to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to record fee" });
  }
});

// 5. Record Expense
app.post('/api/expenses', async (req, res) => {
  try {
    const { category, amount, date, notes } = req.body;
    const exp = await prisma.expense.create({
      data: { category, amount: Number(amount), date, notes }
    });
    res.json({ success: true, expense: exp });
  } catch (err) {
    console.error("Error recording expense to PostgreSQL:", err);
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
    console.error("Error adding notice to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to add notice" });
  }
});

// 7. Save Grade Entry
app.post('/api/grades', async (req, res) => {
  try {
    const { studentId, subject, score, term } = req.body;
    const grade = await prisma.grade.create({
      data: { studentId: Number(studentId), subject, score: Number(score), term }
    });
    res.json({ success: true, grade });
  } catch (err) {
    console.error("Error adding grade to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to add grade" });
  }
});

// Health Check Endpoint

app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Backend is running',
        time: new Date().toISOString()
    });
});

import os from 'os';

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.listen(PORT, "0.0.0.0", () => {
  // const localIp = getLocalIpAddress();
  console.log(`🚀 Eureka School Prisma Server connected to PostgreSQL running on: ${PORT}`);
  // console.log(`server is running on port :${PORT}`);
  // console.log(`   - Network: https://eureka-school-api.onrender.com :${PORT}`)
});
