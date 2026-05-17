import API_BASE from './config.js';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API request failed');
  }
  return res.json();
}

export function getTasks(category) {
  const query = category ? `?category=${category}` : '';
  return request(`/api/tasks${query}`);
}

export function createTask(task) {
  return request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export function updateTask(id, updates) {
  return request(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export function deleteTask(id) {
  return request(`/api/tasks/${id}`, { method: 'DELETE' });
}

export function completeTask(id) {
  return request(`/api/tasks/${id}/complete`, { method: 'POST' });
}

export function uncompleteTask(id) {
  return request(`/api/tasks/${id}/uncomplete`, { method: 'POST' });
}

export function getPoints() {
  return request('/api/points');
}
