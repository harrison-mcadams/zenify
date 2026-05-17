const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Reset recurring tasks on each request
app.use((req, res, next) => {
  db.resetDueRecurringTasks();
  next();
});

// --- Routes ---
app.get('/api/tasks', (req, res) => {
  const tasks = db.getAllTasks(req.query.category);
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { title, points, category, type, recurrence } = req.body;
  if (!title || !category || !type) {
    return res.status(400).json({ error: 'title, category, and type are required' });
  }
  const task = db.createTask({ title, points, category, type, recurrence });
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const existing = db.getTaskById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const { title, points, category, type, recurrence } = req.body;
  const task = db.updateTask(req.params.id, {
    title: title ?? existing.title,
    points: points ?? existing.points,
    category: category ?? existing.category,
    type: type ?? existing.type,
    recurrence: recurrence ?? existing.recurrence,
  });
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const existing = db.getTaskById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  db.deleteTask(req.params.id);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/complete', (req, res) => {
  const task = db.completeTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.post('/api/tasks/:id/uncomplete', (req, res) => {
  const task = db.uncompleteTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.get('/api/points', (req, res) => {
  const points = db.getPoints();
  res.json(points);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Start ---
async function start() {
  await db.initDb();
  db.seedIfEmpty();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Zenify API listening on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
