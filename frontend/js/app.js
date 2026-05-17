import * as api from './api.js';

// ========== State ==========
let state = {
  tasks: [],
  points: { total: 0, byCategory: [], recent: [] },
  activeCategory: 'all',
  editingTaskId: null,
  connected: false,
  showCompleted: false,
  sortBy: 'frequency',
  surfacedIndices: { wellness: 0, chores: 0 },
};

// ========== DOM Refs ==========
const $ = (sel) => document.querySelector(sel);
const taskListEl = $('#task-list');
const digitHundredsEl = $('#digit-hundreds');
const digitTensEl = $('#digit-tens');
const digitOnesEl = $('#digit-ones');
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

// Solari split-flap: cycle through each intermediate digit one at a time
const activeRollers = new Map(); // track in-flight animations per element

function rollDigit(el, targetValue) {
  if (!el) return;
  const target = parseInt(targetValue);
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;

  // Cancel any in-flight roller on this element
  if (activeRollers.has(el)) {
    clearInterval(activeRollers.get(el));
    activeRollers.delete(el);
  }

  // Build the sequence of digits to flip through
  // A real Solari board always advances forward (0→1→2→...→9→0→1→...)
  const steps = [];
  let d = current;
  do {
    d = (d + 1) % 10;
    steps.push(d);
  } while (d !== target);

  let i = 0;
  const FLIP_INTERVAL = 80; // ms per flap — fast but visible

  const intervalId = setInterval(() => {
    // Trigger the CSS flip animation
    el.classList.remove('flip-active');
    void el.offsetWidth; // reflow to restart animation

    el.textContent = steps[i];
    el.classList.add('flip-active');

    i++;
    if (i >= steps.length) {
      clearInterval(intervalId);
      activeRollers.delete(el);
    }
  }, FLIP_INTERVAL);

  activeRollers.set(el, intervalId);
}

function getRecurrenceHours(recurrence) {
  switch (recurrence) {
    case 'daily': return 24;
    case 'weekly': return 168;
    case 'monthly': return 720;
    case 'on-completion': return 336; // 14 days
    default: return 336; // One-off: 14 days
  }
}

function calculateUrgencyScore(task) {
  if (!task.completed_at) {
    const freqWeight = getRecurrenceHours(task.recurrence);
    return 999999 - freqWeight;
  }
  const lastCompleted = new Date(task.completed_at);
  const elapsedHours = (new Date() - lastCompleted) / (1000 * 60 * 60);
  const intervalHours = getRecurrenceHours(task.recurrence);
  return elapsedHours / intervalHours;
}

function getRecurrenceRank(recurrence) {
  switch (recurrence) {
    case 'daily': return 4;
    case 'weekly': return 3;
    case 'monthly': return 2;
    case 'on-completion': return 1;
    default: return 0;
  }
}

function sortTasks(tasksList) {
  const listCopy = [...tasksList];
  if (state.sortBy === 'frequency') {
    listCopy.sort((a, b) => {
      const rankA = getRecurrenceRank(a.recurrence);
      const rankB = getRecurrenceRank(b.recurrence);
      if (rankB !== rankA) return rankB - rankA;
      return a.title.localeCompare(b.title);
    });
  } else {
    // Sort by Last Completed
    listCopy.sort((a, b) => {
      if (a.completed && b.completed) {
        return new Date(b.completed_at) - new Date(a.completed_at);
      }
      if (a.completed) return -1;
      if (b.completed) return 1;
      return a.title.localeCompare(b.title);
    });
  }
  return listCopy;
}

function setSort(type) {
  state.sortBy = type;
  const btnFreq = document.getElementById('sort-btn-frequency');
  const btnRec = document.getElementById('sort-btn-recency');
  if (btnFreq) btnFreq.classList.toggle('sort-btn--active', type === 'frequency');
  if (btnRec) btnRec.classList.toggle('sort-btn--active', type === 'recency');
  renderTasks();
}

function refreshAllSuggestions() {
  state.surfacedIndices.wellness++;
  state.surfacedIndices.chores++;
  renderTasks();
  showToast("Refreshed suggestions! 🔄");
}

// ========== Rendering ==========
function renderPoints() {
  const totalStr = String(state.points.total || 0).padStart(3, '0');
  rollDigit(digitHundredsEl, totalStr[0]);
  rollDigit(digitTensEl, totalStr[1]);
  rollDigit(digitOnesEl, totalStr[2]);
}

function renderTasks() {
  const sortBar = document.getElementById('sort-bar');

  if (state.activeCategory === 'all') {
    if (sortBar) sortBar.style.display = 'none';

    // "All" tab: surface exactly one Wellness task and one Chores task
    const activeWellness = state.tasks.filter(t => t.category === 'wellness' && !t.completed);
    const activeChores = state.tasks.filter(t => t.category === 'chores' && !t.completed);

    // Sort by Urgency Ratio DESC
    activeWellness.sort((a, b) => calculateUrgencyScore(b) - calculateUrgencyScore(a));
    activeChores.sort((a, b) => calculateUrgencyScore(b) - calculateUrgencyScore(a));

    let wellnessSuggestion = null;
    if (activeWellness.length > 0) {
      const idx = state.surfacedIndices.wellness % activeWellness.length;
      wellnessSuggestion = activeWellness[idx];
    }

    let choresSuggestion = null;
    if (activeChores.length > 0) {
      const idx = state.surfacedIndices.chores % activeChores.length;
      choresSuggestion = activeChores[idx];
    }

    let html = `
      <div class="suggestions-header">
        <span class="suggestions-title">Today's Focus</span>
        <button class="btn-refresh-suggestions" onclick="window.zenify.refreshAllSuggestions()">REFRESH SUGGESTIONS</button>
      </div>`;

    if (wellnessSuggestion) {
      html += renderTaskCard(wellnessSuggestion);
    }
    if (choresSuggestion) {
      html += renderTaskCard(choresSuggestion);
    }

    if (!wellnessSuggestion && !choresSuggestion) {
      html += `
        <div class="empty-state">
          <div class="empty-state__icon">🎉</div>
          <div class="empty-state__text">All caught up! Tap Chores or Wellness to see all, or add a new task!</div>
        </div>`;
    }

    // Still display all completed tasks on All tab
    const completed = state.tasks.filter(t => t.completed);
    if (completed.length > 0) {
      html += `
        <div class="task-section-header">
          <span class="task-section-label">Completed</span>
          <button class="btn-toggle-completed" onclick="window.zenify.toggleShowCompleted()">${state.showCompleted ? 'HIDE' : 'SHOW'}</button>
        </div>`;
      if (state.showCompleted) {
        html += completed.map(renderTaskCard).join('');
      }
    }

    taskListEl.innerHTML = html;
  } else {
    // Individual tabs: show whole sorted list of tasks
    if (sortBar) sortBar.style.display = 'flex';

    const categoryTasks = state.tasks.filter(t => t.category === state.activeCategory);
    if (categoryTasks.length === 0) {
      taskListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📋</div>
          <div class="empty-state__text">No tasks yet. Tap + to add one!</div>
        </div>`;
      return;
    }

    const sortedTasks = sortTasks(categoryTasks);
    const active = sortedTasks.filter(t => !t.completed);
    const completed = sortedTasks.filter(t => t.completed);

    let html = '';

    if (active.length > 0) {
      html += `<div class="task-section-label">To Do</div>`;
      html += active.map(renderTaskCard).join('');
    }

    if (completed.length > 0) {
      html += `
        <div class="task-section-header">
          <span class="task-section-label">Completed</span>
          <button class="btn-toggle-completed" onclick="window.zenify.toggleShowCompleted()">${state.showCompleted ? 'HIDE' : 'SHOW'}</button>
        </div>`;
      if (state.showCompleted) {
        html += completed.map(renderTaskCard).join('');
      }
    }

    taskListEl.innerHTML = html;
  }
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

  const actionBtn = isCompleted
    ? `<button class="task-card__action-btn task-card__action-btn--restore" onclick="window.zenify.toggleComplete('${task.id}')" title="Restore/Undo task">↺</button>`
    : `<button class="task-card__action-btn" onclick="window.zenify.editTask('${task.id}')" title="Edit">✏️</button>`;

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
        ${actionBtn}
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
      showToast(`Task restored! Points deducted. ↺`);
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

async function cashOut() {
  if (!confirm("Are you sure you want to cash out and reset your points counter?")) return;
  try {
    await api.resetPoints();
    state.points = await api.getPoints();
    renderPoints();
    showToast("Cashed out! Points reset. 💸");
  } catch (err) {
    console.error(err);
    showToast("Failed to reset points");
  }
}

function toggleShowCompleted() {
  state.showCompleted = !state.showCompleted;
  renderTasks();
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
window.zenify = { toggleComplete, removeTask, editTask, cashOut, toggleShowCompleted, setSort, refreshAllSuggestions };

// Go
init();
