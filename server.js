const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Admin Auth =====
const ADMIN_KEY = process.env.ADMIN_KEY || 'sanli2026';
function requireAuth(req, res, next) {
  const key = req.query.key || (req.headers['authorization'] || '').replace('Bearer ', '');
  if (key !== ADMIN_KEY) {
    const urlPath = req.originalUrl || req.url || req.path;
    if (urlPath.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(401).json({ error: '未授权' });
    }
    return res.send(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>三力诊断 · 管理后台</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: -apple-system,'PingFang SC','Microsoft YaHei',sans-serif; background:#08090c; color:#e4e2df; min-height:100vh; display:flex; align-items:center; justify-content:center; }
          .box { background:#15171e; border:1px solid #23262f; border-radius:12px; padding:40px 32px; width:100%; max-width:360px; }
          h2 { text-align:center; margin-bottom:8px; font-size:20px; }
          p { text-align:center; color:#a0a0b2; font-size:13px; margin-bottom:24px; }
          input { width:100%; padding:10px 14px; border-radius:8px; border:1px solid #23262f; background:#0e1015; color:#e4e2df; font-size:15px; outline:none; margin-bottom:16px; }
          input:focus { border-color:#C4A265; }
          button { width:100%; padding:10px; border-radius:8px; border:none; background:#C4A265; color:#08090c; font-size:15px; font-weight:600; cursor:pointer; }
          button:hover { opacity:0.9; }
          .err { color:#C23A2B; font-size:13px; text-align:center; margin-bottom:12px; display:none; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>🔒 管理后台</h2>
          <p>三力智策 · 品牌三力诊断</p>
          <div class="err" id="err">密码错误，请重试</div>
          <input type="password" id="key" placeholder="请输入访问密码" autofocus />
          <button onclick="login()">进入后台</button>
        </div>
        <script>
          function login() {
            const key = document.getElementById('key').value;
            if (!key) return;
            window.location.href = '/admin?key=' + encodeURIComponent(key);
          }
          document.getElementById('key').addEventListener('keydown', e => { if(e.key==='Enter') login(); });
          if (new URLSearchParams(location.search).get('error') === '1') {
            document.getElementById('err').style.display = 'block';
          }
        </script>
      </body>
      </html>
    `);
  }
  next();
}
app.use('/admin', requireAuth);
app.use('/api/submissions', requireAuth);
app.use('/api/stats', requireAuth);

// Middleware
const allowedOrigins = [
  'https://sanli-quiz.github.io',
  'https://yechen35.github.io',
  'http://localhost:3000',
  'http://localhost:5500'
];
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
    callback(null, true);
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

// Helper: send JSON with UTF-8 charset
function json(res, data, status) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (status) res.status(status);
  res.json(data);
}

// API: Submit test result
app.post('/api/submit', (req, res) => {
  try {
    const { user_name, industry, brand_name, brand_score, channel_score, data_score, base_type, sub_type, hexagram, answers } = req.body;

    if (!user_name || !industry || !brand_name) {
      return json(res, { error: '缺少必填字段' }, 400);
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

    json(res, { success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Submit error:', err);
    json(res, { error: '提交失败' }, 500);
  }
});

// API: List submissions (admin)
app.get('/api/submissions', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM submissions ORDER BY created_at DESC LIMIT 200').all();
    json(res, rows);
  } catch (err) {
    console.error('List error:', err);
    json(res, { error: '查询失败' }, 500);
  }
});

// API: Stats
app.get('/api/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
    const byType = db.prepare('SELECT base_type, COUNT(*) as count FROM submissions GROUP BY base_type ORDER BY count DESC').all();
    const byIndustry = db.prepare('SELECT industry, COUNT(*) as count FROM submissions GROUP BY industry ORDER BY count DESC').all();
    const avgScores = db.prepare('SELECT AVG(brand_score) as avg_brand, AVG(channel_score) as avg_channel, AVG(data_score) as avg_data FROM submissions').get();
    json(res, { total, byType, byIndustry, avgScores });
  } catch (err) {
    console.error('Stats error:', err);
    json(res, { error: '查询失败' }, 500);
  }
});

// API: Delete submission
app.delete('/api/submissions/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return json(res, { error: '记录不存在' }, 404);
    json(res, { success: true });
  } catch (err) {
    console.error('Delete error:', err);
    json(res, { error: '删除失败' }, 500);
  }
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`\n  三力诊断服务已启动`);
  console.log(`  测试页面: http://localhost:${PORT}`);
  console.log(`  管理后台: http://localhost:${PORT}/admin\n`);
});
