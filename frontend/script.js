// Authentication & Global Helpers for index.html
document.addEventListener('DOMContentLoaded', () => {
    setupAuthHandlers();
    
    // Check if already logged in and redirect
    const savedUser = sessionStorage.getItem('user');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        redirectByRole(user.role);
    }
});

function redirectByRole(role) {
    if (role === 'Admin' || role === 'Manager') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'user.html';
    }
}

function setupAuthHandlers() {
    document.getElementById('show-signup')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form-container').classList.add('hidden');
        document.getElementById('signup-form-container').classList.remove('hidden');
    });

    document.getElementById('show-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('signup-form-container').classList.add('hidden');
        document.getElementById('login-form-container').classList.remove('hidden');
    });

    document.getElementById('signup-form')?.addEventListener('submit', handleSignup);
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('forgot-password-form')?.addEventListener('submit', handleForgotPassword);
    document.getElementById('reset-password-form')?.addEventListener('submit', handleResetPassword);
    
    document.getElementById('show-forgot-password')?.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('forgot-password-modal');
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', hideModals);
    });
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

    if (!/^\d{10}$/.test(signupData.mobile_number)) {
        showToast('Mobile number must be exactly 10 digits', 'danger');
        hideLoader();
        return;
    }

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
            sessionStorage.setItem('user', JSON.stringify(result.user));
            showToast('Login successful!');
            setTimeout(() => redirectByRole(result.user.role), 500);
        } else {
            showToast(result.error || 'Login failed', 'danger');
        }
    } catch (err) {
        showToast('Error during login', 'danger');
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
        if (response.ok) {
            showToast('Reset code sent to your email!');
            hideModals();
            showModal('reset-password-modal');
        } else {
            const result = await response.json();
            showToast(result.error || 'Request failed', 'danger');
        }
    } catch (err) { showToast('Error requesting reset', 'danger'); }
    finally { hideLoader(); }
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
        if (response.ok) {
            showToast('Password reset successful! Please login.');
            hideModals();
            document.getElementById('show-login').click();
        } else {
            const result = await response.json();
            showToast(result.error || 'Reset failed', 'danger');
        }
    } catch (err) { showToast('Error resetting password', 'danger'); }
    finally { hideLoader(); }
}

// Global UI Helpers
function showModal(id) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function hideModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function showLoader() {
    document.getElementById('global-loader').classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('global-loader').classList.add('hidden');
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
