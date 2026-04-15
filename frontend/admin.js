let users = [];
let tasks = [];
let onlineUserIds = []; // Track online user IDs
let activeUserId = null;
let socket = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in and is Admin/Manager
    const savedUser = sessionStorage.getItem('user');
    if (!savedUser) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);
    if (user.role === 'Employee') {
        window.location.href = 'user.html';
        return;
    }

    activeUserId = user.id;
    socket = io();

    // Signal that this user is online
    socket.emit('user_online', activeUserId);

    // Listen for online users updates
    socket.on('update_online_users', (ids) => {
        onlineUserIds = ids;
        renderUsersTable();
    });

    // UI Setup
    document.getElementById('logged-user-name').textContent = user.name || 'Admin';
    document.getElementById('user-role-badge').textContent = user.role || 'Admin';

    // Listen for real-time notifications
    socket.on('new_notification', (data) => {
        if (data.userId == activeUserId) {
            // Note: Admin usually doesn't need to see task-assigned notifications for themselves in this app's logic
            // but we keep the listener for system announcements etc.
            fetchNotifications();
        }
    });

    setupEventListeners();
    fetchUsers();
    fetchTasks();
    fetchStats();
    
    // Set min date for task assignment
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('task-due-date').setAttribute('min', today);

    // Check hash for initial view
    const hash = window.location.hash.substring(1) || 'dashboard';
    switchView(hash);
});

async function fetchUsers() {
    showLoader();
    try {
        const user = JSON.parse(sessionStorage.getItem('user'));
        const response = await fetch(`/api/users?role=${user.role}`);
        users = await response.json();
        renderUsersTable();
        updateTaskUserSelectors();
    } catch (err) {
        console.error('Error fetching users:', err);
    } finally {
        hideLoader();
    }
}

async function fetchTasks() {
    showLoader();
    try {
        const user = JSON.parse(sessionStorage.getItem('user'));
        const response = await fetch(`/api/tasks?userId=${user.id}&role=${user.role}`);
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
        const user = JSON.parse(sessionStorage.getItem('user'));
        const response = await fetch(`/api/stats?userId=${user.id}&role=${user.role}`);
        const stats = await response.json();
        
        document.getElementById('stats-users').textContent = stats.totalUsers || 0;
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

    // Modals
    document.getElementById('open-add-user-modal').addEventListener('click', () => showModal('add-user-modal'));
    document.getElementById('open-assign-task-modal').addEventListener('click', () => showModal('assign-task-modal'));
    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', hideModals));

    // Forms
    document.getElementById('add-user-form').addEventListener('submit', handleAddUser);
    document.getElementById('assign-task-form').addEventListener('submit', handleAssignTask);
    document.getElementById('broadcast-form').addEventListener('submit', handleBroadcast);

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
        document.getElementById('view-title').textContent = viewId.charAt(0).toUpperCase() + viewId.slice(1);
        window.location.hash = viewId;
    }
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-view') === viewId);
    });
}

// Actions
async function handleAddUser(e) {
    e.preventDefault();
    showLoader();
    const userData = {
        name: document.getElementById('user-name').value,
        email: document.getElementById('user-email').value,
        mobile_number: document.getElementById('user-mobile').value,
        password: document.getElementById('user-password').value,
        role: document.getElementById('user-role').value
    };

    if (!/^\d{10}$/.test(userData.mobile_number)) {
        showToast('Mobile number must be exactly 10 digits', 'danger');
        hideLoader();
        return;
    }

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        if (response.ok) {
            showToast('User created successfully!');
            hideModals();
            e.target.reset();
            fetchUsers();
            fetchStats();
        }
    } catch (err) {
        showToast('Error creating user', 'danger');
    } finally {
        hideLoader();
    }
}

async function handleAssignTask(e) {
    e.preventDefault();
    showLoader();
    const taskData = {
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-description').value,
        userId: document.getElementById('task-user-id').value,
        dueDate: document.getElementById('task-due-date').value,
        assignedBy: activeUserId
    };

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });

        if (response.ok) {
            showToast('Task assigned successfully!');
            hideModals();
            e.target.reset();
            fetchTasks();
            fetchStats();
        }
    } catch (err) {
        showToast('Error assigning task', 'danger');
    } finally {
        hideLoader();
    }
}

async function handleBroadcast(e) {
    e.preventDefault();
    showLoader();
    const broadcastData = {
        message: document.getElementById('broadcast-message').value
    };

    try {
        const response = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(broadcastData)
        });

        if (response.ok) {
            showToast('Broadcast sent successfully!');
            e.target.reset();
        }
    } catch (err) {
        showToast('Error sending broadcast', 'danger');
    } finally {
        hideLoader();
    }
}

// Rendering
function renderUsersTable() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = users.map(user => {
        const isOnline = onlineUserIds.includes(user.id);
        return `
            <tr>
                <td>${user.id}</td>
                <td>
                    <div class="user-name-cell">
                        ${user.name}
                    </div>
                </td>
                <td>${user.email}</td>
                <td><span class="user-role-badge">${user.role || 'Employee'}</span></td>
                <td>
                    <div class="task-actions">
                        <span class="status-dot ${isOnline ? 'status-online' : 'status-offline'}" title="${isOnline ? 'Online' : 'Offline'}"></span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderTasksTable() {
    const tbody = document.querySelector('#tasks-table tbody');
    tbody.innerHTML = tasks.filter(t => (t.user_role || 'Employee') === 'Employee').map(task => `
        <tr>
            <td>${task.id}</td>
            <td>${task.title}</td>
            <td>${task.description || ''}</td>
            <td>${task.user_name || 'Unassigned'}</td>
            <td>${task.created_at ? new Date(task.created_at).toLocaleDateString() : 'N/A'}</td>
            <td>${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}</td>
            <td><span class="status-badge status-${task.status}">${task.status}</span></td>
            <td>
                <div class="task-actions">
                    ${task.file_path ? `<a href="${task.file_path}" target="_blank" class="btn btn-sm btn-secondary" title="View PDF">📄</a>` : ''}
                    <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})" title="Delete Task">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderRecentTasks() {
    const container = document.getElementById('recent-tasks-list');
    const sortedTasks = [...tasks].filter(t => (t.user_role || 'Employee') === 'Employee').sort((a, b) => b.id - a.id);
    
    if (sortedTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No tasks found</div>';
        return;
    }

    container.innerHTML = sortedTasks.slice(0, 5).map(task => `
        <div class="task-item">
            <div>
                <strong>${task.title}</strong>
                <p style="font-size: 0.8rem; color: var(--text-muted)">Assigned to: ${task.user_name || 'Unknown'}</p>
            </div>
            <span class="status-badge status-${task.status}">${task.status}</span>
        </div>
    `).join('');
}



function updateTaskUserSelectors() {
    const select = document.getElementById('task-user-id');
    select.innerHTML = '<option value="">Select User</option>' + 
        users
        .filter(u => (u.role || 'Employee') === 'Employee')
        .map(u => `<option value="${u.id}">${u.name}</option>`).join('');
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

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    fetchUsers();
    fetchStats();
    showToast('User deleted');
}

async function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    showLoader();
    try {
        const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('Task deleted successfully');
            fetchTasks();
            fetchStats();
        } else {
            showToast('Error deleting task', 'danger');
        }
    } catch (err) {
        console.error('Error deleting task:', err);
        showToast('Error deleting task', 'danger');
    } finally {
        hideLoader();
    }
}

// Helpers
function showModal(id) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
function hideModals() { document.getElementById('modal-overlay').classList.add('hidden'); }
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
