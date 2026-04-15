let tasks = [];
let activeUserId = null;
let socket = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    const savedUser = sessionStorage.getItem('user');
    if (!savedUser) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);

    // Hard role protection
    if (user.role === 'Admin' || user.role === 'Manager') {
        window.location.href = 'admin.html';
        return;
    }

    activeUserId = user.id;
    socket = io();

    // Signal that this user is online
    socket.emit('user_online', activeUserId);

    // UI Setup
    document.getElementById('logged-user-name').textContent = user.name || 'User';
    document.getElementById('user-role-badge').textContent = user.role || 'Employee';

    // Listen for real-time notifications
    socket.on('new_notification', (data) => {
        if (data.userId == activeUserId) {
            showToast(`New Notification: ${data.message}`);
            fetchNotifications();
            fetchTasks(); // Refresh tasks automatically
        }
    });

    setupEventListeners();
    fetchTasks();
    fetchStats();
    fetchNotifications();
    
    // Check hash for initial view
    const hash = window.location.hash.substring(1) || 'dashboard';
    switchView(hash);
});

async function fetchTasks() {
    showLoader();
    try {
        const response = await fetch(`/api/tasks?userId=${activeUserId}&role=Employee`);
        tasks = await response.json();
        renderTasksTable();
        renderRecentTasks();
    } catch (err) {
        console.error('Error fetching tasks:', err);
    } finally {
        hideLoader();
    }
}

async function fetchStats() {
    try {
        const response = await fetch(`/api/stats?userId=${activeUserId}&role=Employee`);
        const stats = await response.json();
        document.getElementById('stats-tasks').textContent = stats.activeTasks || 0;
        document.getElementById('stats-notis').textContent = stats.totalNotifications || 0;
    } catch (err) {
        console.error('Error fetching stats:', err);
    }
}

function setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchView(item.getAttribute('data-view')));
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    // Notifications
    document.getElementById('noti-bell').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('noti-dropdown').classList.toggle('active');
    });

    document.getElementById('mark-all-read').addEventListener('click', markAllNotificationsRead);

    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('noti-dropdown');
        if (!document.getElementById('noti-bell').contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    const target = document.getElementById(`${viewId}-view`);
    if (target) {
        target.classList.remove('hidden');
        document.getElementById('view-title').textContent = viewId === 'dashboard' ? 'My Dashboard' : 'My Tasks';
        window.location.hash = viewId;
    }
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-view') === viewId);
    });
}

// Actions
async function completeTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task || !task.file_path) {
        alert('file not uploaded');
        return;
    }

    try {
        showLoader();
        const response = await fetch(`/api/tasks/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
        });
        
        const result = await response.json();
        if (response.ok) {
            showToast('Task completed!');
            fetchTasks();
            fetchStats();
        } else {
            showToast(result.error || 'Error updating task', 'danger');
        }
    } catch (err) {
        showToast('Error updating task', 'danger');
    } finally {
        hideLoader();
    }
}

function triggerFileUpload(taskId) {
    currentlyUploadingTaskId = taskId;
    document.getElementById('task-file-input').click();
}

let currentlyUploadingTaskId = null;
document.getElementById('task-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentlyUploadingTaskId) return;
    
    // Size & Type validation
    if (file.type !== 'application/pdf') {
        showToast('Only PDF files are allowed', 'danger');
        e.target.value = '';
        return;
    }

    const minSize = 1 * 1024; // 1 KB
    const maxSize = 1024 * 1024 * 1024; // 1 GB
    if (file.size < minSize) {
        showToast('File size must be at least 1 KB', 'danger');
        e.target.value = '';
        return;
    }
    if (file.size > maxSize) {
        showToast('File size exceeds 1 GB limit', 'danger');
        e.target.value = '';
        return;
    }
    const formData = new FormData();
    formData.append('taskFile', file);
    try {
        showLoader();
        const response = await fetch(`/api/tasks/${currentlyUploadingTaskId}/upload`, {
            method: 'POST',
            body: formData
        });
        if (response.ok) {
            showToast('File uploaded successfully!');
            fetchTasks();
        } else {
            const err = await response.json();
            showToast(err.error || 'Upload failed', 'danger');
        }
    } catch (err) { showToast('Upload error', 'danger'); }
    finally { hideLoader(); e.target.value = ''; }
});

// Rendering
function renderTasksTable() {
    const tbody = document.querySelector('#tasks-table tbody');
    tbody.innerHTML = tasks.map(task => `
        <tr>
            <td>${task.id}</td>
            <td>${task.title}</td>
            <td>${task.description || ''}</td>
            <td>${task.created_at ? new Date(task.created_at).toLocaleDateString() : 'N/A'}</td>
            <td>${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}</td>
            <td><span class="status-badge status-${task.status}">${task.status}</span></td>
            <td>
                <div class="task-actions">
                    ${task.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="completeTask(${task.id})">Complete</button>` : `<span class="badge badge-success">✓ Done</span>`}
                    ${task.file_path ? `<a href="${task.file_path}" target="_blank" class="btn btn-sm btn-secondary">📄 View PDF</a>` : `<button class="btn btn-sm btn-outline" onclick="triggerFileUpload(${task.id})">📤 Upload PDF</button>`}
                </div>
            </td>
        </tr>
    `).join('');
}

function renderRecentTasks() {
    const container = document.getElementById('recent-tasks-list');
    const sortedTasks = [...tasks].sort((a, b) => new Date(b.due_date) - new Date(a.due_date));
    
    if (sortedTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No active tasks</div>';
        return;
    }

    container.innerHTML = sortedTasks.slice(0, 3).map(task => `
        <div class="task-item">
            <div>
                <strong>${task.title}</strong>
                <p style="font-size: 0.8rem; color: var(--text-muted)">Due: ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}</p>
            </div>
            <span class="status-badge status-${task.status}">${task.status}</span>
        </div>
    `).join('');
}

async function fetchNotifications() {
    if (!activeUserId) return;
    try {
        const response = await fetch(`/api/notifications/${activeUserId}`);
        const notifications = await response.json();
        const unreadCount = notifications.filter(n => n.status === 'unread').length;
        document.getElementById('noti-badge').textContent = unreadCount;
        document.getElementById('noti-badge').classList.toggle('hidden', unreadCount === 0);
        
        const list = document.getElementById('noti-list');
        list.innerHTML = notifications.length === 0 ? '<div class="empty-state">No notifications</div>' : 
            notifications.map(n => `
                <div class="notification-item ${n.status === 'unread' ? 'unread' : ''}">
                    <strong>Notification</strong>
                    <p style="font-size: 0.85rem">${n.message}</p>
                    <span class="noti-time">${new Date(n.created_at).toLocaleString()}</span>
                </div>
            `).join('');
    } catch (err) { console.error(err); }
}

async function markAllNotificationsRead() {
    await fetch(`/api/notifications/read-all?userId=${activeUserId}`, { method: 'POST' });
    fetchNotifications();
}

// Helpers
function showLoader() { document.getElementById('global-loader').classList.remove('hidden'); }
function hideLoader() { document.getElementById('global-loader').classList.add('hidden'); }
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
