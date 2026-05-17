const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'zenify.db');

let db;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      points      INTEGER NOT NULL DEFAULT 1,
      category    TEXT NOT NULL,
      type        TEXT NOT NULL,
      recurrence  TEXT,
      completed   INTEGER DEFAULT 0,
      completed_at TEXT,
      created_at  TEXT NOT NULL,
      sort_order  INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS points_log (
      id        TEXT PRIMARY KEY,
      task_id   TEXT NOT NULL,
      task_title TEXT NOT NULL,
      points    INTEGER NOT NULL,
      category  TEXT NOT NULL,
      earned_at TEXT NOT NULL
    )
  `);

  save();
  return db;
}

function save() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper to run a query and return rows as objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// --- Query Functions ---
function getAllTasks(category) {
  if (category) {
    return queryAll('SELECT * FROM tasks WHERE category = ? ORDER BY completed ASC, sort_order ASC, created_at DESC', [category]);
  }
  return queryAll('SELECT * FROM tasks ORDER BY completed ASC, sort_order ASC, created_at DESC');
}

function getTaskById(id) {
  return queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
}

function createTask({ title, points, category, type, recurrence }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  run(
    'INSERT INTO tasks (id, title, points, category, type, recurrence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, title, points || 1, category, type, recurrence || null, now]
  );
  return getTaskById(id);
}

function updateTask(id, { title, points, category, type, recurrence }) {
  run(
    'UPDATE tasks SET title = ?, points = ?, category = ?, type = ?, recurrence = ? WHERE id = ?',
    [title, points, category, type, recurrence || null, id]
  );
  return getTaskById(id);
}

function deleteTask(id) {
  run('DELETE FROM tasks WHERE id = ?', [id]);
}

function completeTask(id) {
  const task = getTaskById(id);
  if (!task || task.completed) return task;

  const now = new Date().toISOString();

  // Log points
  run(
    'INSERT INTO points_log (id, task_id, task_title, points, category, earned_at) VALUES (?, ?, ?, ?, ?, ?)',
    [uuidv4(), task.id, task.title, task.points, task.category, now]
  );

  if (task.type === 'recurring' && task.recurrence === 'on-completion') {
    // On-completion: log points, keep task uncompleted for reuse
    // Don't mark completed at all
  } else {
    run('UPDATE tasks SET completed = 1, completed_at = ? WHERE id = ?', [now, id]);
  }

  return getTaskById(id);
}

function uncompleteTask(id) {
  run('UPDATE tasks SET completed = 0, completed_at = NULL WHERE id = ?', [id]);
  run('DELETE FROM points_log WHERE id = (SELECT id FROM points_log WHERE task_id = ? ORDER BY earned_at DESC LIMIT 1)', [id]);
  return getTaskById(id);
}

function getPoints() {
  const totalRow = queryOne('SELECT COALESCE(SUM(points), 0) as total FROM points_log');
  const total = totalRow ? totalRow.total : 0;
  const recent = queryAll('SELECT * FROM points_log ORDER BY earned_at DESC LIMIT 50');
  const byCategory = queryAll('SELECT category, COALESCE(SUM(points), 0) as total FROM points_log GROUP BY category');
  return { total, byCategory, recent };
}

function resetDueRecurringTasks() {
  const tasks = queryAll(
    "SELECT * FROM tasks WHERE type = 'recurring' AND completed = 1 AND completed_at IS NOT NULL"
  );
  const now = new Date();
  let resetCount = 0;

  for (const task of tasks) {
    if (!task.completed_at || task.recurrence === 'on-completion') continue;

    const completedAt = new Date(task.completed_at);
    let shouldReset = false;

    switch (task.recurrence) {
      case 'daily':
        shouldReset = now.toDateString() !== completedAt.toDateString();
        break;
      case 'weekly': {
        const msInWeek = 7 * 24 * 60 * 60 * 1000;
        shouldReset = (now - completedAt) >= msInWeek;
        break;
      }
      case 'monthly':
        shouldReset = now.getMonth() !== completedAt.getMonth() || now.getFullYear() !== completedAt.getFullYear();
        break;
    }

    if (shouldReset) {
      run('UPDATE tasks SET completed = 0, completed_at = NULL WHERE id = ?', [task.id]);
      resetCount++;
    }
  }

  return resetCount;
}

function seedIfEmpty() {
  const row = queryOne('SELECT COUNT(*) as c FROM tasks');
  if (row && row.c > 0) return;

  const seeds = [
    { title: 'Go for a run', points: 5, category: 'wellness', type: 'recurring', recurrence: 'on-completion' },
    { title: 'Laundry', points: 5, category: 'chores', type: 'recurring', recurrence: 'weekly' },
    { title: 'Do the dishes', points: 1, category: 'chores', type: 'recurring', recurrence: 'daily' },
    { title: 'Clean litterboxes', points: 1, category: 'chores', type: 'recurring', recurrence: 'daily' },
  ];

  for (const seed of seeds) {
    createTask(seed);
  }
  console.log('Seeded default tasks.');
}

module.exports = {
  initDb,
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  uncompleteTask,
  getPoints,
  resetDueRecurringTasks,
  seedIfEmpty,
};
