const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = [
  'https://sanli-quiz.github.io',
  'https://yechen35.github.io',
  'http://localhost:3000',
  'http://localhost:5500'
];
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
    callback(null, true); // Allow all for now, tighten later
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database
const dataDir = path.join(__dirname, 'data');
if (!require('fs').existsSync(dataDir)) require('fs').mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'submissions.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    user_name TEXT NOT NULL,
    industry TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    brand_score INTEGER NOT NULL,
    channel_score INTEGER NOT NULL,
    data_score INTEGER NOT NULL,
    base_type TEXT NOT NULL,
    sub_type TEXT NOT NULL,
    hexagram TEXT NOT NULL,
    answers TEXT NOT NULL
  )
`);

// API: Submit test result
app.post('/api/submit', (req, res) => {
  try {
    const { user_name, industry, brand_name, brand_score, channel_score, data_score, base_type, sub_type, hexagram, answers } = req.body;
    
    if (!user_name || !industry || !brand_name) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const stmt = db.prepare(`
      INSERT INTO submissions (user_name, industry, brand_name, brand_score, channel_score, data_score, base_type, sub_type, hexagram, answers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      user_name, industry, brand_name,
      brand_score, channel_score, data_score,
      base_type, sub_type, hexagram,
      JSON.stringify(answers)
    );
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: '提交失败' });
  }
});

// API: List submissions (admin)
app.get('/api/submissions', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM submissions ORDER BY created_at DESC LIMIT 200').all();
    res.json(rows);
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// API: Stats
app.get('/api/stats', (req, req2) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
    const byType = db.prepare('SELECT base_type, COUNT(*) as count FROM submissions GROUP BY base_type ORDER BY count DESC').all();
    const byIndustry = db.prepare('SELECT industry, COUNT(*) as count FROM submissions GROUP BY industry ORDER BY count DESC').all();
    const avgScores = db.prepare('SELECT AVG(brand_score) as avg_brand, AVG(channel_score) as avg_channel, AVG(data_score) as avg_data FROM submissions').get();
    res.json({ total, byType, byIndustry, avgScores });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`\n  三力诊断服务已启动`);
  console.log(`  测试页面: http://localhost:${PORT}`);
  console.log(`  管理后台: http://localhost:${PORT}/admin\n`);
});
