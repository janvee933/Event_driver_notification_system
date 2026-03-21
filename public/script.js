let users = [];
let tasks = [];
let activeUserId = localStorage.getItem('activeUserId') || null;
let pollInterval = null;
let socket = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    socket = io();

    // Listen for real-time notifications
    socket.on('new_notification', (data) => {
        if (!activeUserId) return;
        
        if (data.userId == activeUserId) {
            const currentUser = users.find(u => u.id == activeUserId);
            const role = currentUser ? (currentUser.role || 'Employee') : 'Employee';
            
            // Only show user dashboard real-time notifications, prevent for Admin
            if (role !== 'Admin') {
                showToast(`New Notification: ${data.message}`);
                fetchNotifications(false); 
                fetchTasksForPolling(); // Auto update tasks as well
            }
        }
    });

    fetchUsers();
    fetchTasks();
    fetchStats();
    setupEventListeners();
    setupAuthHandlers();
    
    // Check auth state
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        activeUserId = user.id;
        showApp(user);
    } else {
        showAuth();
    }
    
    // Check hash for initial view
    const hash = window.location.hash.substring(1) || 'dashboard';
    switchView(hash);
});

function showAuth() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.querySelector('.app-container').classList.add('hidden');
}

function showApp(user) {
    document.getElementById('auth-container').classList.add('hidden');
    document.querySelector('.app-container').classList.remove('hidden');
    
    // Hide/Show Admin features
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        if (user.role === 'Admin') {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });

    document.getElementById('logged-user-name').textContent = user.name || 'User';
    const roleBadge = document.getElementById('user-role-badge');
    roleBadge.textContent = user.role || 'Employee';
    roleBadge.classList.remove('hidden');
    
    // Update active user select to show current user
    const select = document.getElementById('active-user-select');
    select.value = user.id;
    
    handleUserChange(user.id);
}

function setupAuthHandlers() {
    document.getElementById('show-signup').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form-container').classList.add('hidden');
        document.getElementById('signup-form-container').classList.remove('hidden');
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('signup-form-container').classList.add('hidden');
        document.getElementById('login-form-container').classList.remove('hidden');
    });

    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('login-form').addEventListener('submit', handleLogin);
}

async function handleSignup(e) {
    e.preventDefault();
    showLoader();
    const signupData = {
        name: document.getElementById('signup-name').value,
        email: document.getElementById('signup-email').value,
        mobile_number: document.getElementById('signup-mobile').value,
        password: document.getElementById('signup-password').value,
        confirm_password: document.getElementById('signup-confirm-password').value
    };

    try {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signupData)
        });

        const result = await response.json();
        if (response.ok) {
            showToast('Signup successful! Please login.');
            document.getElementById('show-login').click();
        } else {
            showToast(result.error || 'Signup failed', 'danger');
        }
    } catch (err) {
        showToast('Error during signup', 'danger');
    } finally {
        hideLoader();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    showLoader();
    const loginData = {
        identifier: document.getElementById('login-identifier').value,
        password: document.getElementById('login-password').value
    };

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginData)
        });

        const result = await response.json();
        if (response.ok) {
            localStorage.setItem('user', JSON.stringify(result.user));
            activeUserId = result.user.id;
            showApp(result.user);
            showToast('Login successful!');
            fetchUsers(); // Refresh users list
        } else {
            showToast(result.error || 'Login failed', 'danger');
        }
    } catch (err) {
        showToast('Error during login', 'danger');
    } finally {
        hideLoader();
    }
}

async function fetchUsers() {
    showLoader();
    try {
        const response = await fetch('/api/users');
        users = await response.json();
        renderUsersTable();
        updateUserSelector();
        updateTaskUserSelectors();
        
        // Restore active user session if it exists in local storage
        if (activeUserId) {
            const select = document.getElementById('active-user-select');
            select.value = activeUserId;
            // Manually trigger the change event logic
            handleUserChange(activeUserId);
        }
    } catch (err) {
        console.error('Error fetching users:', err);
    } finally {
        hideLoader();
    }
}

async function fetchTasks() {
    showLoader();
    try {
        const response = await fetch('/api/tasks');
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
        let url = '/api/stats';
        if (activeUserId) {
            const user = users.find(u => u.id == activeUserId);
            const role = user ? (user.role || 'Employee') : 'Employee';
            url += `?userId=${activeUserId}&role=${role}`;
        }

        const response = await fetch(url);
        const stats = await response.json();
        
        const statsUsersElem = document.getElementById('stats-users');
        if (statsUsersElem) statsUsersElem.textContent = stats.totalUsers || 0;
        
        document.getElementById('stats-tasks').textContent = stats.activeTasks || 0;
        document.getElementById('stats-notis').textContent = stats.totalNotifications || 0;
    } catch (err) {
        console.error('Error fetching stats:', err);
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            switchView(view);
        });
    });

    // User Selector
    document.getElementById('active-user-select').addEventListener('change', (e) => {
        handleUserChange(e.target.value);
    });

    // Modals
    document.getElementById('open-add-user-modal').addEventListener('click', () => showModal('add-user-modal'));
    document.getElementById('open-assign-task-modal').addEventListener('click', () => showModal('assign-task-modal'));
    
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', hideModals);
    });

    // Forms
    document.getElementById('add-user-form').addEventListener('submit', handleAddUser);
    document.getElementById('assign-task-form').addEventListener('submit', handleAssignTask);
    document.getElementById('broadcast-form').addEventListener('submit', handleBroadcast);
    document.getElementById('forgot-password-form').addEventListener('submit', handleForgotPassword);
    document.getElementById('reset-password-form').addEventListener('submit', handleResetPassword);

    document.getElementById('show-forgot-password').addEventListener('click', (e) => {
        e.preventDefault();
        showModal('forgot-password-modal');
    });

    document.getElementById('noti-bell').addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('noti-dropdown');
        dropdown.classList.toggle('active');
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('user');
        localStorage.removeItem('activeUserId');
        location.reload();
    });

    document.getElementById('mark-all-read').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent closing dropdown
        markAllNotificationsRead();
    });

    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('noti-dropdown');
        const bell = document.getElementById('noti-bell');
        if (!bell.contains(e.target) && !dropdown.contains(e.target)) { // Also check if click is inside dropdown
            dropdown.classList.remove('active');
        }
    });
}

function handleUserChange(newUserId) {
    activeUserId = newUserId;
    if (activeUserId) {
        localStorage.setItem('activeUserId', activeUserId);
    } else {
        localStorage.removeItem('activeUserId');
    }

    const roleBadge = document.getElementById('user-role-badge');
    
    if (activeUserId) {
        // Check if this is the logged-in user (session)
        const savedUserJson = localStorage.getItem('user');
        const savedUser = savedUserJson ? JSON.parse(savedUserJson) : null;
        
        let role = 'Employee';
        if (savedUser && savedUser.id == activeUserId) {
            role = savedUser.role || 'Employee';
        } else {
            const user = users.find(u => u.id == activeUserId);
            role = user ? (user.role || 'Employee') : 'Employee';
        }

        roleBadge.textContent = role;
        roleBadge.classList.remove('hidden');
        
        fetchNotifications(true); // Pass flag for initial load
        updateRoleUI(role);
    } else {
        roleBadge.classList.add('hidden');
        document.getElementById('noti-badge').textContent = '0';
        document.getElementById('noti-badge').classList.add('hidden');
        document.getElementById('noti-list').innerHTML = '<div class="empty-state">Select a user to see notifications</div>';
        updateRoleUI('Employee'); // Default strict view
    }
    
    // Re-render tasks to apply role-based filtering
    renderTasksTable();
    renderRecentTasks();
}

function switchView(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Show target view
    const target = document.getElementById(`${viewId}-view`);
    if (target) {
        target.classList.remove('hidden');
        document.getElementById('view-title').textContent = viewId.charAt(0).toUpperCase() + viewId.slice(1);
        window.location.hash = viewId;
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-view') === viewId);
    });
}

// User Actions
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
        title: document.getElementById('broadcast-title').value,
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

async function handleForgotPassword(e) {
    e.preventDefault();
    showLoader();
    const email = document.getElementById('forgot-email').value;

    try {
        const response = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const result = await response.json();
        if (response.ok) {
            showToast('Reset code sent to your email!');
            hideModals();
            showModal('reset-password-modal');
        } else {
            showToast(result.error || 'Request failed', 'danger');
        }
    } catch (err) {
        showToast('Error requesting reset', 'danger');
    } finally {
        hideLoader();
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    showLoader();
    const email = document.getElementById('forgot-email').value;
    const token = document.getElementById('reset-token').value;
    const newPassword = document.getElementById('reset-password').value;

    try {
        const response = await fetch('/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token, newPassword })
        });

        const result = await response.json();
        if (response.ok) {
            showToast('Password reset successful! Please login.');
            hideModals();
            document.getElementById('show-login').click();
        } else {
            showToast(result.error || 'Reset failed', 'danger');
        }
    } catch (err) {
        showToast('Error resetting password', 'danger');
    } finally {
        hideLoader();
    }
}

// Rendering Functions
function renderUsersTable() {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="user-role-badge">${user.role || 'Employee'}</span></td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function renderTasksTable() {
    const tbody = document.querySelector('#tasks-table tbody');
    
    // Filter by role
    let displayTasks = tasks;
    
    // Global filter: Show only tasks assigned to Employees
    displayTasks = displayTasks.filter(t => (t.user_role || 'Employee') === 'Employee');

    if (activeUserId) {
        const currentUser = users.find(u => u.id == activeUserId);
        const role = currentUser ? (currentUser.role || 'Employee') : 'Employee';
        
        if (role === 'Employee') {
            displayTasks = displayTasks.filter(t => t.assigned_to == activeUserId);
        }
    }

    tbody.innerHTML = displayTasks.map(task => `
        <tr>
            <td>${task.id}</td>
            <td>${task.title}</td>
            <td>${task.description || ''}</td>
            <td>${task.user_name || 'Unassigned'}</td>
            <td>${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}</td>
            <td><span class="status-badge status-${task.status}">${task.status}</span></td>
            <td>
                <div class="task-actions">
                    ${task.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="completeTask(${task.id})">Complete</button>` : `<span class="badge badge-success">✓ Done</span>`}
                    
                    ${activeUserId && task.assigned_to == activeUserId && (users.find(u => u.id == activeUserId)?.role === 'Employee') ? `
                        ${task.file_path ? 
                            `
                            <a href="${task.file_path}" target="_blank" class="btn btn-sm btn-secondary">📄 View PDF</a>
                            <button class="btn btn-sm btn-danger" onclick="deleteTaskFile(${task.id})" title="Delete File">🗑️</button>
                            ` : 
                            `<button class="btn btn-sm btn-outline" onclick="triggerFileUpload(${task.id})">📤 Upload PDF</button>`
                        }
                    ` : task.file_path ? `<a href="${task.file_path}" target="_blank" class="btn btn-sm btn-secondary">📄 View PDF</a>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function renderRecentTasks() {
    const container = document.getElementById('recent-tasks-list');
    
    // Global filter: Show only tasks assigned to Employees
    let displayTasks = tasks.filter(t => (t.user_role || 'Employee') === 'Employee');

    if (activeUserId) {
        const currentUser = users.find(u => u.id == activeUserId);
        const role = currentUser ? (currentUser.role || 'Employee') : 'Employee';
        if (role === 'Employee') {
            displayTasks = displayTasks.filter(t => t.assigned_to == activeUserId);
        }
    }
    
    // Sort tasks by ID descending to show newest first (optional but good practice)
    const sortedTasks = [...displayTasks].sort((a, b) => b.id - a.id);
    
    if (sortedTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No tasks found</div>';
        return;
    }

    container.innerHTML = sortedTasks.map(task => `
        <div class="task-item">
            <div>
                <strong>${task.title}</strong>
                <p style="font-size: 0.8rem; color: var(--text-muted)">Assigned to: ${task.user_name || 'Unknown'}</p>
            </div>
            <span class="status-badge status-${task.status}">${task.status}</span>
        </div>
    `).join('');
}

function updateUserSelector() {
    const select = document.getElementById('active-user-select');
    const currentVal = select.value;
    select.innerHTML = '<option value="">Select User</option>' + 
        users.map(u => `<option value="${u.id}" ${u.id == currentVal ? 'selected' : ''}>${u.name} (${u.role || 'Employee'})</option>`).join('');
}

function updateTaskUserSelectors() {
    const select = document.getElementById('task-user-id');
    select.innerHTML = '<option value="">Select User</option>' + 
        users.map(u => `<option value="${u.id}">${u.name} (${u.role || 'Employee'})</option>`).join('');
}

// Notifications & Auto-Updating
async function fetchNotifications(isInitialLoad = false) {
    if (!activeUserId) return;
    
    try {
        const response = await fetch(`/api/notifications/${activeUserId}`);
        const notifications = await response.json();
        
        const currentUnreadCount = parseInt(document.getElementById('noti-badge').textContent) || 0;
        const newUnreadCount = notifications.filter(n => n.status === 'unread').length;
        
        document.getElementById('noti-badge').textContent = newUnreadCount;
        document.getElementById('noti-badge').classList.toggle('hidden', newUnreadCount === 0);
        
        // Auto refresh tasks if a NEW notification arrives during active polling
        if (!isInitialLoad && newUnreadCount > currentUnreadCount) {
             fetchTasksForPolling(); // Refresh tasks automatically
        }
        
        const list = document.getElementById('noti-list');
        if (notifications.length === 0) {
            list.innerHTML = '<div class="empty-state">No notifications</div>';
        } else {
            list.innerHTML = notifications.map(n => `
                <div class="notification-item ${n.status === 'unread' ? 'unread' : ''}">
                    <strong>Notification</strong>
                    <p style="font-size: 0.85rem">${n.message}</p>
                    <span class="noti-time">${new Date(n.created_at).toLocaleString()}</span>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('Error fetching notifications:', err);
    }
}

async function fetchTasksForPolling() {
    try {
        const response = await fetch('/api/tasks');
        tasks = await response.json();
        renderTasksTable();
        renderRecentTasks();
        fetchStats();
    } catch (err) {
        console.error('Error auto-updating tasks:', err);
    }
}

function startNotificationPolling() {
    // Polling removed: Using Socket.io for real-time updates instead.
    stopNotificationPolling();
}

function stopNotificationPolling() {
    if (pollInterval) clearInterval(pollInterval);
}

async function markAllNotificationsRead() {
    if (!activeUserId) return;
    try {
        await fetch(`/api/notifications/read-all?userId=${activeUserId}`, { method: 'POST' });
        fetchNotifications();
    } catch (err) {
        console.error('Error marking read:', err);
    }
}

// Loader functions
function showLoader() {
    document.getElementById('global-loader').classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('global-loader').classList.add('hidden');
}

// Helper Functions
function showModal(id) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function hideModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateRoleUI(role) {
    const isEmployee = role === 'Employee';
    
    const usersNav = document.querySelector('.nav-item[data-view="users"]');
    if (usersNav) usersNav.style.display = isEmployee ? 'none' : 'flex';

    // Hide broadcast for regular employees
    const broadcastNav = document.querySelector('.nav-item[data-view="broadcast"]');
    if (broadcastNav) broadcastNav.style.display = isEmployee ? 'none' : 'flex';
    
    const manageUsersBtn = document.querySelector('button[onclick="switchView(\'users\')"]');
    if (manageUsersBtn) manageUsersBtn.style.display = isEmployee ? 'none' : 'inline-block';

    // Update all elements related to task assignment
    const assignTaskBtns = document.querySelectorAll('#open-assign-task-modal, button[onclick="switchView(\'tasks\')"]');
    assignTaskBtns.forEach(btn => btn.style.display = isEmployee ? 'none' : 'inline-block');

    // Stat Cards Customization
    const cardUsers = document.getElementById('stat-card-users');
    const labelTasks = document.getElementById('stat-label-tasks');
    const labelNotis = document.getElementById('stat-label-notis');
    const iconNotis = document.getElementById('stat-icon-notis');

    if (isEmployee) {
        if (cardUsers) cardUsers.style.display = 'none';
        if (labelTasks) labelTasks.textContent = 'My Tasks';
        if (labelNotis) labelNotis.textContent = 'My Notifications';
        if (iconNotis) iconNotis.textContent = '🔔';
    } else {
        if (cardUsers) cardUsers.style.display = 'flex';
        if (labelTasks) labelTasks.textContent = 'Total Tasks';
        if (labelNotis) labelNotis.textContent = 'Sent Notifications';
        if (iconNotis) iconNotis.textContent = '📩';
    }

    if (isEmployee && (window.location.hash === '#users' || window.location.hash === '#broadcast')) {
        switchView('dashboard');
    }

    // Refresh stats for the current role/user
    fetchStats();
}

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
        await fetch(`/api/users/${id}`, { method: 'DELETE' });
        fetchUsers();
        fetchStats();
        showToast('User deleted');
    } catch (err) {
        showToast('Error deleting user', 'danger');
    }
}

async function completeTask(id) {
    try {
        await fetch(`/api/tasks/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
        });
        fetchTasks();
        showToast('Task completed!');
    } catch (err) {
        showToast('Error updating task', 'danger');
    }
}

let currentlyUploadingTaskId = null;

function triggerFileUpload(taskId) {
    currentlyUploadingTaskId = taskId;
    document.getElementById('task-file-input').click();
}

// Global listener for file input
document.getElementById('task-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentlyUploadingTaskId) return;

    // Client-side validation
    if (file.type !== 'application/pdf') {
        showToast('Only PDF files are allowed', 'danger');
        e.target.value = '';
        return;
    }

    const minSize = 2 * 1024 * 1024; // 2MB
    const maxSize = 1024 * 1024 * 1024; // 1GB

    if (file.size < minSize) {
        showToast('File size must be at least 2MB', 'danger');
        e.target.value = '';
        return;
    }

    if (file.size > maxSize) {
        showToast('File size must be less than 1GB', 'danger');
        e.target.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('taskFile', file);

    try {
        showToast('Uploading file...', 'info');
        const response = await fetch(`/api/tasks/${currentlyUploadingTaskId}/upload`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            showToast('File uploaded successfully!');
            fetchTasks(); // Refresh to show the download link
        } else {
            showToast(result.error || 'Upload failed', 'danger');
        }
    } catch (err) {
        console.error('Upload Error:', err);
        showToast('Error uploading file', 'danger');
    } finally {
        e.target.value = '';
        currentlyUploadingTaskId = null;
    }
});

async function deleteTaskFile(taskId) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        const response = await fetch(`/api/tasks/${taskId}/upload`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('File deleted successfully');
            fetchTasks(); // Refresh UI
        } else {
            const result = await response.json();
            showToast(result.error || 'Deletion failed', 'danger');
        }
    } catch (err) {
        console.error('Delete Error:', err);
        showToast('Error deleting file', 'danger');
    }
}
