import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Enable CORS for all origins and headers
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// 1. Get All Data
app.get('/api/data', async (req, res) => {
  try {
    const studentsDb = await prisma.student.findMany({ orderBy: { studentId: 'asc' } });
    const staffDb = await prisma.staff.findMany({ orderBy: { staffId: 'asc' } });
    const grades = await prisma.grade.findMany({ orderBy: { id: 'asc' } });
    const transactions = await prisma.transaction.findMany({ orderBy: { id: 'desc' } });
    const expenses = await prisma.expense.findMany({ orderBy: { id: 'desc' } });
    const notices = await prisma.notice.findMany({ orderBy: { id: 'desc' } });
    const attendanceDb = await prisma.attendance.findMany();

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

    // Convert attendance list to dictionary { [studentId]: isPresent } or { [date]: records }
    const attendance = {};
    attendanceDb.forEach(att => {
      try {
        attendance[att.date] = JSON.parse(att.records);
      } catch (e) {
        attendance[att.date] = att.records;
      }
    });

    res.json({ students, staff, grades, transactions, expenses, notices, attendance });
  } catch (err) {
    console.error("Error fetching PostgreSQL DB data:", err);
    res.status(500).json({ error: "Failed to read database from PostgreSQL" });
  }
});

// 2. Add Student / Enroll Student
app.post('/api/students', async (req, res) => {
  try {
    const { id, name, grade, guardian, status, feesPaid, attendedDays, totalDays, joiningDate, leavingDate } = req.body;
    
    let targetStudentId = Number(id);
    if (!targetStudentId || isNaN(targetStudentId)) {
      const maxStudent = await prisma.student.aggregate({ _max: { studentId: true } });
      targetStudentId = (maxStudent._max.studentId || 100) + 1;
    } else {
      // Check if studentId is already in use
      const existing = await prisma.student.findUnique({ where: { studentId: targetStudentId } });
      if (existing) {
        const maxStudent = await prisma.student.aggregate({ _max: { studentId: true } });
        targetStudentId = (maxStudent._max.studentId || targetStudentId) + 1;
      }
    }

    const newStudent = await prisma.student.create({
      data: {
        studentId: targetStudentId,
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
    res.json({ success: true, student: { ...newStudent, id: newStudent.studentId } });
  } catch (err) {
    console.error("Error adding student to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to add student" });
  }
});

// 3. Add Staff
app.post('/api/staff', async (req, res) => {
  try {
    const { id, name, role, phone, joiningDate, leavingDate } = req.body;
    
    let targetStaffId = Number(id);
    if (!targetStaffId || isNaN(targetStaffId)) {
      const maxStaff = await prisma.staff.aggregate({ _max: { staffId: true } });
      targetStaffId = (maxStaff._max.staffId || 0) + 1;
    } else {
      // Check if staffId is already in use
      const existing = await prisma.staff.findUnique({ where: { staffId: targetStaffId } });
      if (existing) {
        const maxStaff = await prisma.staff.aggregate({ _max: { staffId: true } });
        targetStaffId = (maxStaff._max.staffId || targetStaffId) + 1;
      }
    }

    const newStaff = await prisma.staff.create({
      data: {
        staffId: targetStaffId,
        name,
        role,
        phone,
        joiningDate: joiningDate || "2023-01-15",
        leavingDate: leavingDate || null
      }
    });
    res.json({ success: true, staff: { ...newStaff, id: newStaff.staffId } });
  } catch (err) {
    console.error("Error adding staff to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to add staff" });
  }
});

// 4. Record Fee Payment (supports both /api/fees and /api/transactions)
const handleFeeOrTransaction = async (req, res) => {
  try {
    const { studentName, studentId, amount, type, date, notes } = req.body;
    const tx = await prisma.transaction.create({
      data: {
        studentName: studentName || "Student",
        studentId: Number(studentId) || 0,
        amount: Number(amount) || 0,
        type: type || "Tuition",
        date: date || new Date().toISOString().split('T')[0]
      }
    });
    
    // Update student fees in PostgreSQL
    if (studentId) {
      const student = await prisma.student.findUnique({ where: { studentId: Number(studentId) } });
      if (student) {
        await prisma.student.update({
          where: { studentId: Number(studentId) },
          data: { feesPaid: (student.feesPaid || 0) + Number(amount || 0), status: "Active" }
        });
      }
    }

    res.json({ success: true, transaction: tx });
  } catch (err) {
    console.error("Error recording fee to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to record fee" });
  }
};

app.post('/api/fees', handleFeeOrTransaction);
app.post('/api/transactions', handleFeeOrTransaction);

// 5. Record Expense
app.post('/api/expenses', async (req, res) => {
  try {
    const { category, amount, date, notes } = req.body;
    const exp = await prisma.expense.create({
      data: {
        category,
        amount: Number(amount),
        date: date || new Date().toISOString().split('T')[0],
        notes: notes || null
      }
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
      data: {
        title,
        content,
        date: date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
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
      data: {
        studentId: Number(studentId),
        subject,
        score: Number(score),
        term: term || "Mid Term 1"
      }
    });
    res.json({ success: true, grade });
  } catch (err) {
    console.error("Error adding grade to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to add grade" });
  }
});

// 8. Daily Attendance Roll Call
app.post('/api/attendance', async (req, res) => {
  try {
    const { date, records } = req.body;
    const dateStr = date || new Date().toISOString().split('T')[0];
    const recordsStr = typeof records === 'string' ? records : JSON.stringify(records || {});

    const attendanceRecord = await prisma.attendance.upsert({
      where: { date: dateStr },
      update: { records: recordsStr },
      create: { date: dateStr, records: recordsStr }
    });

    res.json({ success: true, attendance: attendanceRecord });
  } catch (err) {
    console.error("Error saving attendance to PostgreSQL:", err);
    res.status(500).json({ error: "Failed to save attendance" });
  }
});

app.get('/api/attendance', async (req, res) => {
  try {
    const records = await prisma.attendance.findMany({ orderBy: { date: 'desc' } });
    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

// =====================================================
// 9. Online Teaching - Lessons API
// =====================================================

// GET ALL LESSONS
app.get('/api/lessons', async (req, res) => {
  try {
    const { publishStatus, classId, subjectId } = req.query;
    let whereClause = {};
    if (publishStatus) whereClause.publishStatus = publishStatus;
    if (classId) whereClause.classId = classId;
    if (subjectId) whereClause.subjectId = subjectId;

    const lessons = await prisma.lesson.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    const formattedLessons = lessons.map(lesson => ({
      ...lesson,
      files: lesson.files ? JSON.parse(lesson.files) : []
    }));

    res.json({ success: true, lessons: formattedLessons });
  } catch (err) {
    console.error('Error fetching lessons:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch lessons' });
  }
});

// GET SINGLE LESSON
app.get('/api/lessons/:id', async (req, res) => {
  try {
    const lessonId = Number(req.params.id);
    const lesson = await prisma.lesson.findUnique({ where: { lessonId } });
    if (!lesson) return res.status(404).json({ success: false, error: 'Lesson not found' });
    
    lesson.files = lesson.files ? JSON.parse(lesson.files) : [];
    res.json({ success: true, lesson });
  } catch (err) {
    console.error('Error fetching lesson:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch lesson' });
  }
});

// CREATE LESSON
app.post('/api/lessons', async (req, res) => {
  try {
    const { classId, subjectId, topicTitle, description, createdBy, publishStatus } = req.body;
    if (!classId || !subjectId || !topicTitle) {
      return res.status(400).json({ success: false, error: 'classId, subjectId, topicTitle are required' });
    }

    const lesson = await prisma.lesson.create({
      data: {
        classId,
        subjectId,
        topicTitle,
        description: description || null,
        createdBy: createdBy || 1,
        publishStatus: publishStatus || 'Draft',
        files: '[]'
      }
    });

    res.status(201).json({ success: true, lesson: { ...lesson, files: [] } });
  } catch (err) {
    console.error('Error creating lesson:', err);
    res.status(500).json({ success: false, error: 'Failed to create lesson' });
  }
});

// UPDATE LESSON
app.put('/api/lessons/:id', async (req, res) => {
  try {
    const lessonId = Number(req.params.id);
    const { classId, subjectId, topicTitle, description, publishStatus } = req.body;

    const lesson = await prisma.lesson.update({
      where: { lessonId },
      data: {
        ...(classId !== undefined && { classId }),
        ...(subjectId !== undefined && { subjectId }),
        ...(topicTitle !== undefined && { topicTitle }),
        ...(description !== undefined && { description }),
        ...(publishStatus !== undefined && { publishStatus })
      }
    });

    lesson.files = lesson.files ? JSON.parse(lesson.files) : [];
    res.json({ success: true, lesson });
  } catch (err) {
    console.error('Error updating lesson:', err);
    res.status(500).json({ success: false, error: 'Failed to update lesson' });
  }
});

// DELETE LESSON
app.delete('/api/lessons/:id', async (req, res) => {
  try {
    const lessonId = Number(req.params.id);
    await prisma.lesson.delete({ where: { lessonId } });
    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (err) {
    console.error('Error deleting lesson:', err);
    res.status(500).json({ success: false, error: 'Failed to delete lesson' });
  }
});

// UPLOAD LESSON FILES
app.post('/api/lessons/:id/files', upload.array('files'), async (req, res) => {
  try {
    const lessonId = Number(req.params.id);
    const attachmentType = req.body.attachmentType || 'document';
    
    const lesson = await prisma.lesson.findUnique({ where: { lessonId } });
    if (!lesson) return res.status(404).json({ success: false, error: 'Lesson not found' });
    
    let existingFiles = lesson.files ? JSON.parse(lesson.files) : [];
    
    if (req.files) {
      const newFiles = req.files.map(file => ({
        name: file.originalname,
        url: `/uploads/${file.filename}`,
        type: attachmentType,
        size: file.size
      }));
      existingFiles = [...existingFiles, ...newFiles];
    }
    
    const updatedLesson = await prisma.lesson.update({
      where: { lessonId },
      data: { files: JSON.stringify(existingFiles) }
    });
    
    updatedLesson.files = existingFiles;
    res.json({ success: true, lesson: updatedLesson });
  } catch (err) {
    console.error('Error uploading files:', err);
    res.status(500).json({ success: false, error: 'Failed to upload files' });
  }
});

// Health Check Endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Eureka School Backend is running and connected to Neon PostgreSQL',
    time: new Date().toISOString()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Eureka School Prisma Server running on port: ${PORT}`);
});
