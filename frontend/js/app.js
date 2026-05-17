import * as api from './api.js';

// ========== State ==========
let state = {
  tasks: [],
  points: { total: 0, byCategory: [], recent: [] },
  activeCategory: 'all',
  editingTaskId: null,
  connected: false,
};

// ========== DOM Refs ==========
const $ = (sel) => document.querySelector(sel);
const taskListEl = $('#task-list');
const totalPointsEl = $('#total-points');
const wellnessPointsEl = $('#wellness-points');
const choresPointsEl = $('#chores-points');
const modalOverlay = $('#modal-overlay');
const modalTitle = $('#modal-title');
const taskForm = $('#task-form');
const titleInput = $('#task-title-input');
const pointsInput = $('#task-points-input');
const categoryToggle = $('#category-toggle');
const typeToggle = $('#type-toggle');
const recurrenceGroup = $('#recurrence-group');
const recurrenceSelect = $('#recurrence-select');
const btnSubmit = $('#btn-submit');
const toastEl = $('#toast');
const connectionDot = $('#connection-dot');
const connectionText = $('#connection-text');

// ========== Init ==========
async function init() {
  setupEventListeners();
  await refresh();
  // Poll for updates every 30s
  setInterval(refresh, 30000);
}

async function refresh() {
  try {
    const [tasks, points] = await Promise.all([
      api.getTasks(),
      api.getPoints(),
    ]);
    state.tasks = tasks;
    state.points = points;
    state.connected = true;
    renderPoints();
    renderTasks();
    renderConnection(true);
  } catch (e) {
    console.error('Failed to fetch:', e);
    renderConnection(false);
  }
}

// ========== Rendering ==========
function renderPoints() {
  const prev = parseInt(totalPointsEl.textContent) || 0;
  totalPointsEl.textContent = state.points.total;

  if (state.points.total > prev) {
    totalPointsEl.classList.remove('bump');
    void totalPointsEl.offsetWidth; // reflow
    totalPointsEl.classList.add('bump');
  }

  const wellnessTotal = state.points.byCategory.find(c => c.category === 'wellness')?.total || 0;
  const choresToal = state.points.byCategory.find(c => c.category === 'chores')?.total || 0;
  wellnessPointsEl.textContent = wellnessTotal;
  choresPointsEl.textContent = choresToal;
}

function renderTasks() {
  const filtered = state.activeCategory === 'all'
    ? state.tasks
    : state.tasks.filter(t => t.category === state.activeCategory);

  const active = filtered.filter(t => !t.completed);
  const completed = filtered.filter(t => t.completed);

  if (filtered.length === 0) {
    taskListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <div class="empty-state__text">No tasks yet. Tap + to add one!</div>
      </div>`;
    return;
  }

  let html = '';

  if (active.length > 0) {
    html += `<div class="task-section-label">To Do</div>`;
    html += active.map(renderTaskCard).join('');
  }

  if (completed.length > 0) {
    html += `<div class="task-section-label">Completed</div>`;
    html += completed.map(renderTaskCard).join('');
  }

  taskListEl.innerHTML = html;
}

function renderTaskCard(task) {
  const isCompleted = task.completed;
  const catClass = `task-card--${task.category}`;
  const completedClass = isCompleted ? 'task-card--completed' : '';

  let metaHtml = '';
  if (task.type === 'recurring' && task.recurrence) {
    const icons = { daily: '🔄', weekly: '📅', monthly: '🗓️', 'on-completion': '🔁' };
    const labels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', 'on-completion': 'Repeatable' };
    metaHtml = `<span class="task-card__recurrence">${icons[task.recurrence] || '🔄'} ${labels[task.recurrence] || task.recurrence}</span>`;
  } else {
    metaHtml = `<span>One-off</span>`;
  }

  return `
    <div class="task-card ${catClass} ${completedClass}" data-id="${task.id}">
      <button class="task-card__check" onclick="window.zenify.toggleComplete('${task.id}')" title="${isCompleted ? 'Undo' : 'Complete'}">
        <span class="task-card__check-icon">✓</span>
      </button>
      <div class="task-card__info">
        <div class="task-card__title">${escapeHtml(task.title)}</div>
        <div class="task-card__meta">${metaHtml}</div>
      </div>
      <div class="task-card__points">+${task.points}</div>
      <div class="task-card__actions">
        <button class="task-card__action-btn" onclick="window.zenify.editTask('${task.id}')" title="Edit">✏️</button>
        <button class="task-card__action-btn task-card__action-btn--delete" onclick="window.zenify.removeTask('${task.id}')" title="Delete">🗑️</button>
      </div>
    </div>`;
}

function renderConnection(online) {
  connectionDot.className = online ? 'connection-dot' : 'connection-dot connection-dot--offline';
  connectionText.textContent = online ? 'Connected' : 'Offline';
}

// ========== Actions ==========
async function toggleComplete(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  const card = document.querySelector(`.task-card[data-id="${id}"]`);

  try {
    if (task.completed) {
      await api.uncompleteTask(id);
    } else {
      // Animate
      if (card) {
        card.classList.add('task-card--completing');
        showPointsFly(card, task.points);
      }
      await api.completeTask(id);
      showToast(`+${task.points} points! 🎉`);
    }
    await refresh();
  } catch (e) {
    showToast('Failed to update task');
  }
}

async function removeTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await api.deleteTask(id);
    await refresh();
    showToast('Task deleted');
  } catch (e) {
    showToast('Failed to delete task');
  }
}

function editTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  state.editingTaskId = id;
  modalTitle.textContent = 'Edit Task';
  btnSubmit.textContent = 'Save Changes';

  titleInput.value = task.title;
  pointsInput.value = task.points;

  // Set category toggle
  setToggleValue(categoryToggle, task.category);
  // Set type toggle
  setToggleValue(typeToggle, task.type);
  // Show/hide recurrence
  recurrenceGroup.style.display = task.type === 'recurring' ? '' : 'none';
  if (task.recurrence) recurrenceSelect.value = task.recurrence;

  openModal();
}

// ========== Modal ==========
function openModal() {
  modalOverlay.classList.add('modal-overlay--active');
  setTimeout(() => titleInput.focus(), 300);
}

function closeModal() {
  modalOverlay.classList.remove('modal-overlay--active');
  resetForm();
}

function resetForm() {
  state.editingTaskId = null;
  taskForm.reset();
  modalTitle.textContent = 'New Task';
  btnSubmit.textContent = 'Add Task';
  setToggleValue(categoryToggle, 'wellness');
  setToggleValue(typeToggle, 'one-off');
  recurrenceGroup.style.display = 'none';
  pointsInput.value = 1;
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const data = {
    title: titleInput.value.trim(),
    points: parseInt(pointsInput.value) || 1,
    category: getToggleValue(categoryToggle),
    type: getToggleValue(typeToggle),
    recurrence: getToggleValue(typeToggle) === 'recurring' ? recurrenceSelect.value : null,
  };

  if (!data.title) return;

  try {
    if (state.editingTaskId) {
      await api.updateTask(state.editingTaskId, data);
      showToast('Task updated');
    } else {
      await api.createTask(data);
      showToast('Task added! 🚀');
    }
    closeModal();
    await refresh();
  } catch (e) {
    showToast('Failed to save task');
  }
}

// ========== Toggle Helpers ==========
function setupToggle(container) {
  const buttons = container.querySelectorAll('.toggle-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('toggle-btn--active'));
      btn.classList.add('toggle-btn--active');

      // Show/hide recurrence when type changes
      if (container === typeToggle) {
        recurrenceGroup.style.display = btn.dataset.value === 'recurring' ? '' : 'none';
      }
    });
  });
}

function getToggleValue(container) {
  const active = container.querySelector('.toggle-btn--active');
  return active ? active.dataset.value : null;
}

function setToggleValue(container, value) {
  const buttons = container.querySelectorAll('.toggle-btn');
  buttons.forEach(b => {
    b.classList.toggle('toggle-btn--active', b.dataset.value === value);
  });
}

// ========== Tabs ==========
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('tab--active'));
      tab.classList.add('tab--active');
      state.activeCategory = tab.dataset.category;
      renderTasks();
    });
  });
}

// ========== Utilities ==========
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('toast--visible');
  setTimeout(() => toastEl.classList.remove('toast--visible'), 2500);
}

function showPointsFly(card, points) {
  const rect = card.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'points-fly';
  fly.textContent = `+${points}`;
  fly.style.left = `${rect.right - 40}px`;
  fly.style.top = `${rect.top}px`;
  document.body.appendChild(fly);
  setTimeout(() => fly.remove(), 900);
}

// ========== Event Listeners ==========
function setupEventListeners() {
  // FAB
  $('#fab-add').addEventListener('click', () => {
    resetForm();
    openModal();
  });

  // Modal close
  $('#modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Form
  taskForm.addEventListener('submit', handleFormSubmit);

  // Toggles
  setupToggle(categoryToggle);
  setupToggle(typeToggle);

  // Tabs
  setupTabs();
}

// Expose actions to inline handlers
window.zenify = { toggleComplete, removeTask, editTask };

// Go
init();
