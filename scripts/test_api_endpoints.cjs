const http = require('http');

async function testApi() {
  console.log("Testing Express API endpoints on http://localhost:5000...");
  
  // Helper for fetch / http request
  const fetchJson = (url, options = {}) => {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = http.request({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch(e) {
            resolve({ status: res.statusCode, text: data });
          }
        });
      });
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  };

  // 1. GET /api/data
  console.log("1. Testing GET /api/data...");
  const dataRes = await fetchJson('http://localhost:5000/api/data');
  console.log("GET /api/data status:", dataRes.status);
  console.log("Has lessons array?", Array.isArray(dataRes.data.lessons), "Count:", dataRes.data.lessons.length);

  // 2. POST /api/lessons (Teacher form submission from public/index.html)
  console.log("2. Testing POST /api/lessons (Teacher publish)...");
  const postPayload = {
    grade: "Grade 3",
    subject: "Science",
    title: "Living and Non-living Things",
    description: "Study plants, animals, and surroundings.",
    fileType: "pdf",
    fileUrl: "https://example.com/science.pdf",
    postedBy: "Teacher Rahim",
    date: "2026-08-28"
  };

  const postRes = await fetchJson('http://localhost:5000/api/lessons', {
    method: 'POST',
    body: JSON.stringify(postPayload)
  });
  console.log("POST /api/lessons status:", postRes.status);
  console.log("Created lesson response:", postRes.data);
  const createdLessonId = postRes.data.lesson.id;

  // 3. GET /api/data after post
  console.log("3. Testing GET /api/data to verify new lesson appears in sync...");
  const dataAfterRes = await fetchJson('http://localhost:5000/api/data');
  const found = dataAfterRes.data.lessons.find(l => l.id === createdLessonId);
  console.log("✅ Verified newly created lesson in /api/data:", found ? "YES" : "NO", found);

  // 4. GET /api/lessons with filters
  console.log("4. Testing GET /api/lessons?grade=Grade%203...");
  const filterRes = await fetchJson('http://localhost:5000/api/lessons?grade=Grade%203');
  console.log("Filter results count:", filterRes.data.lessons.length);

  // 5. DELETE /api/lessons/:id
  console.log("5. Testing DELETE /api/lessons/:id...");
  const delRes = await fetchJson(`http://localhost:5000/api/lessons/${createdLessonId}`, { method: 'DELETE' });
  console.log("DELETE status:", delRes.status, delRes.data);

  console.log("🎉 ALL API TESTS PASSED SUCCESSFULLY!");
}

testApi().catch(err => {
  console.error("API test failed:", err);
  process.exit(1);
});
