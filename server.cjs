require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { Client } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
// Use DIRECT_URL for Prisma to avoid Neon pooler cold-start / timeout issues
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});
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
app.use(express.static(path.join(__dirname, 'public')));

// Helper to format lesson objects consistently
function formatLesson(l) {
  if (!l) return null;
  let parsedFiles = [];
  try {
    if (typeof l.files === 'string') {
      parsedFiles = JSON.parse(l.files || '[]');
    } else if (Array.isArray(l.files)) {
      parsedFiles = l.files;
    }
  } catch (_) {
    parsedFiles = [];
  }

  return {
    id: l.id,
    lessonId: l.id,
    grade: l.grade || l.classId || 'All Classes',
    classId: l.classId || l.grade || 'All Classes',
    subject: l.subject || l.subjectId || 'General',
    subjectId: l.subjectId || l.subject || 'General',
    title: l.title || l.topicTitle || 'Untitled Lesson',
    topicTitle: l.topicTitle || l.title || 'Untitled Lesson',
    description: l.description || '',
    fileType: l.fileType || 'link',
    fileUrl: l.fileUrl || '',
    postedBy: l.postedBy || 'Teacher',
    createdBy: l.createdBy || 1,
    publishStatus: l.publishStatus || 'Published',
    date: l.date || (l.createdAt ? new Date(l.createdAt).toISOString().split('T')[0] : ''),
    files: parsedFiles,
    createdAt: l.createdAt
  };
}

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

    let lessonsDb = [];
    try {
      lessonsDb = await prisma.lesson.findMany({ orderBy: { id: 'desc' } });
    } catch (e) {
      console.warn("Failed to fetch lessons via prisma, fallback to pg client:", e.message);
      const pgClient = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      try {
        await pgClient.connect();
        const r = await pgClient.query('SELECT * FROM "Lesson" ORDER BY id DESC');
        lessonsDb = r.rows;
        await pgClient.end();
      } catch (err2) {
        try { await pgClient.end(); } catch (_) {}
      }
    }

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

    const attendance = {};
    attendanceDb.forEach(att => {
      try {
        attendance[att.date] = JSON.parse(att.records);
      } catch (e) {
        attendance[att.date] = att.records;
      }
    });

    const lessons = (lessonsDb || []).map(formatLesson);

    res.json({ students, staff, grades, transactions, expenses, notices, attendance, lessons });
  } catch (err) {
    console.error("Error fetching Prisma DB data:", err);
    res.status(500).json({ error: "Failed to read database" });
  }
});

// 2. Add Pupil
app.post('/api/students', async (req, res) => {
  try {
    const { id, name, grade, guardian, status, feesPaid, attendedDays, totalDays, joiningDate, leavingDate } = req.body;
    
    let targetStudentId = Number(id);
    if (!targetStudentId || isNaN(targetStudentId)) {
      const maxStudent = await prisma.student.aggregate({ _max: { studentId: true } });
      targetStudentId = (maxStudent._max.studentId || 100) + 1;
    } else {
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
    console.error("Error adding student:", err);
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
    console.error("Error adding staff:", err);
    res.status(500).json({ error: "Failed to add staff" });
  }
});

// 4. Record Fee Payment (supports both /api/fees and /api/transactions)
const handleFeeOrTransaction = async (req, res) => {
  try {
    const { studentName, studentId, amount, type, date } = req.body;
    const tx = await prisma.transaction.create({
      data: {
        studentName: studentName || "Student",
        studentId: Number(studentId) || 0,
        amount: Number(amount) || 0,
        type: type || "Tuition",
        date: date || new Date().toISOString().split('T')[0]
      }
    });
    
    // Update student fees in DB
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
    console.error("Error recording fee:", err);
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
    console.error("Error recording expense:", err);
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
    console.error("Error adding notice:", err);
    res.status(500).json({ error: "Failed to add notice" });
  }
});

// 7. Lessons Endpoints
// GET ALL LESSONS
app.get('/api/lessons', async (req, res) => {
  try {
    const { publishStatus, classId, grade, subjectId, subject } = req.query;
    let whereClause = {};
    if (publishStatus) whereClause.publishStatus = publishStatus;
    if (grade) whereClause.grade = grade;
    if (classId) whereClause.classId = classId;
    if (subject) whereClause.subject = subject;
    if (subjectId) whereClause.subjectId = subjectId;

    const lessonsDb = await prisma.lesson.findMany({
      where: whereClause,
      orderBy: { id: 'desc' }
    });

    const lessons = lessonsDb.map(formatLesson);
    res.json({ success: true, lessons });
  } catch (err) {
    console.error('Error fetching lessons:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch lessons' });
  }
});

// GET SINGLE LESSON
app.get('/api/lessons/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid lesson ID' });

    const lesson = await prisma.lesson.findUnique({ where: { id } });
    if (!lesson) return res.status(404).json({ success: false, error: 'Lesson not found' });
    
    res.json({ success: true, lesson: formatLesson(lesson) });
  } catch (err) {
    console.error('Error fetching lesson:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch lesson' });
  }
});

// CREATE LESSON
app.post('/api/lessons', async (req, res) => {
  try {
    const {
      grade, classId,
      subject, subjectId,
      title, topicTitle,
      description,
      fileType,
      fileUrl,
      postedBy,
      createdBy,
      publishStatus,
      date,
      files
    } = req.body;

    const finalGrade = grade || classId || 'All Classes';
    const finalClassId = classId || grade || 'All Classes';
    const finalSubject = subject || subjectId || 'General';
    const finalSubjectId = subjectId || subject || 'General';
    const finalTitle = title || topicTitle || 'Untitled Lesson';
    const finalTopicTitle = topicTitle || title || 'Untitled Lesson';
    const finalDesc = description || null;
    const finalFileType = fileType || 'link';
    const finalFileUrl = fileUrl || null;
    const finalPostedBy = postedBy || 'Teacher';
    const finalCreatedBy = Number(createdBy) || 1;
    const finalStatus = publishStatus || 'Published';
    const finalDate = date || new Date().toISOString().split('T')[0];
    const finalFiles = typeof files === 'string' ? files : JSON.stringify(files || []);

    const lesson = await prisma.lesson.create({
      data: {
        grade: finalGrade,
        classId: finalClassId,
        subject: finalSubject,
        subjectId: finalSubjectId,
        title: finalTitle,
        topicTitle: finalTopicTitle,
        description: finalDesc,
        fileType: finalFileType,
        fileUrl: finalFileUrl,
        postedBy: finalPostedBy,
        createdBy: finalCreatedBy,
        publishStatus: finalStatus,
        date: finalDate,
        files: finalFiles
      }
    });

    console.log("✅ Lesson saved to Neon DB:", lesson.id, finalTitle);
    res.json({ success: true, lesson: formatLesson(lesson) });
  } catch (err) {
    console.error("Error saving lesson:", err);
    res.status(500).json({ error: "Failed to save lesson", details: err.message });
  }
});

// UPDATE LESSON
app.put('/api/lessons/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid lesson ID' });

    const {
      grade, classId,
      subject, subjectId,
      title, topicTitle,
      description,
      fileType,
      fileUrl,
      postedBy,
      createdBy,
      publishStatus,
      date,
      files
    } = req.body;

    const dataToUpdate = {};
    if (grade !== undefined || classId !== undefined) {
      dataToUpdate.grade = grade || classId;
      dataToUpdate.classId = classId || grade;
    }
    if (subject !== undefined || subjectId !== undefined) {
      dataToUpdate.subject = subject || subjectId;
      dataToUpdate.subjectId = subjectId || subject;
    }
    if (title !== undefined || topicTitle !== undefined) {
      dataToUpdate.title = title || topicTitle;
      dataToUpdate.topicTitle = topicTitle || title;
    }
    if (description !== undefined) dataToUpdate.description = description;
    if (fileType !== undefined) dataToUpdate.fileType = fileType;
    if (fileUrl !== undefined) dataToUpdate.fileUrl = fileUrl;
    if (postedBy !== undefined) dataToUpdate.postedBy = postedBy;
    if (createdBy !== undefined) dataToUpdate.createdBy = Number(createdBy);
    if (publishStatus !== undefined) dataToUpdate.publishStatus = publishStatus;
    if (date !== undefined) dataToUpdate.date = date;
    if (files !== undefined) {
      dataToUpdate.files = typeof files === 'string' ? files : JSON.stringify(files || []);
    }

    const lesson = await prisma.lesson.update({
      where: { id },
      data: dataToUpdate
    });

    res.json({ success: true, lesson: formatLesson(lesson) });
  } catch (err) {
    console.error('Error updating lesson:', err);
    res.status(500).json({ success: false, error: 'Failed to update lesson' });
  }
});

// DELETE LESSON
app.delete('/api/lessons/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid lesson ID' });

    await prisma.lesson.delete({ where: { id } });
    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (err) {
    console.error('Error deleting lesson:', err);
    res.status(500).json({ success: false, error: 'Failed to delete lesson' });
  }
});

// UPLOAD LESSON FILES
app.post('/api/lessons/:id/files', upload.array('files'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid lesson ID' });

    const attachmentType = req.body.attachmentType || 'document';
    const lesson = await prisma.lesson.findUnique({ where: { id } });
    if (!lesson) return res.status(404).json({ success: false, error: 'Lesson not found' });
    
    let existingFiles = [];
    try {
      existingFiles = lesson.files ? JSON.parse(lesson.files) : [];
    } catch (_) {
      existingFiles = [];
    }
    
    if (req.files && req.files.length > 0) {
      const newFiles = req.files.map(file => ({
        name: file.originalname,
        url: `/uploads/${file.filename}`,
        type: attachmentType,
        size: file.size
      }));
      existingFiles = [...existingFiles, ...newFiles];
    }
    
    const updatedLesson = await prisma.lesson.update({
      where: { id },
      data: { files: JSON.stringify(existingFiles) }
    });
    
    res.json({ success: true, lesson: formatLesson(updatedLesson) });
  } catch (err) {
    console.error('Error uploading files:', err);
    res.status(500).json({ success: false, error: 'Failed to upload files' });
  }
});

// 8. Save Grade Entry
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
    console.error("Error adding grade:", err);
    res.status(500).json({ error: "Failed to add grade" });
  }
});

// 9. Daily Attendance Roll Call
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

// Health Check Endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running', time: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Eureka School Backend is running and connected to Neon PostgreSQL',
    time: new Date().toISOString()
  });
});

// Connect Prisma and then start listening
prisma.$connect()
  .then(() => {
    console.log('✅ Prisma connected to Neon PostgreSQL');
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Eureka School Prisma Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Prisma failed to connect:', err.message);
    console.log('⚠️  Starting server anyway (will retry per-request)...');
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Eureka School Prisma Server running on http://localhost:${PORT}`);
    });
  });
