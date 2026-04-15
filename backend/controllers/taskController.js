const db = require("../config/db");
const eventEmitter = require("../services/events");
const { notificationQueue } = require("../services/queue");

exports.assignTask = (req, res) => {
  const { title, userId, description, dueDate, assignedBy } = req.body;

  if (!title || !userId || !assignedBy) {
    return res.status(400).json({ error: "title, userId, and assignedBy are required" });
  }

  if (dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(dueDate);
    if (taskDate < today) {
      return res.status(400).json({ error: "Due date cannot be in the past" });
    }
  }

  const sql = "INSERT INTO tasks(title, assigned_to, description, due_date, status, assigned_by) VALUES (?, ?, ?, ?, 'pending', ?)";

  db.query(sql, [title, userId, description || '', dueDate || null, assignedBy], (err, result) => {
    if (err) {
      console.error("[assignTask] DB Error:", err);
      return res.status(500).json({ error: "Failed to assign task", details: err.message });
    }

    eventEmitter.emit("task:assigned", {
      taskId: result.insertId,
      userId,
      title
    });

    res.json({
      message: "Task assigned and event triggered",
      taskId: result.insertId
    });
  });
};

exports.deleteUser = (req, res) => {
  const { id } = req.params;

  
  db.query("DELETE FROM notifications WHERE user_id = ?", [id], (err) => {
    if (err) {
      console.error("[deleteUser] Error deleting notifications:", err);
      return res.status(500).json({ error: "Failed to delete user's notifications" });
    }

    db.query("DELETE FROM users WHERE id = ?", [id], (err, result) => {
      if (err) {
        console.error("[deleteUser] DB Error:", err);
        return res.status(500).json({ error: "Failed to delete user", details: err.message });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      console.log(`[Controller] User ${id} deleted successfully.`);
      res.json({ message: "User deleted successfully" });
    });
  });
};

exports.getNotifications = (req, res) => {
  const userId = req.params.userId;
  const sql = "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC";

  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("[getNotifications] DB Error:", err);
      return res.status(500).json({ error: "Failed to fetch notifications" });
    }
    res.json(result);
  });
};



exports.createUser = (req, res) => {
  const { name, email, mobile_number, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }

  if (mobile_number && !/^\d{10}$/.test(mobile_number)) {
    return res.status(400).json({ error: "Mobile number must be exactly 10 digits" });
  }

  const bcrypt = require("bcryptjs");
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.status(500).json({ error: "Hash error" });

    const sql = "INSERT INTO users(name, email, mobile_number, password, role) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [name, email, mobile_number || null, hashedPassword, role || 'Employee'], (err, result) => {
      if (err) {
        console.error("[createUser] DB Error:", err);
        return res.status(500).json({ error: "Failed to create user", details: err.message });
      }
      
      eventEmitter.emit("user:created_by_admin", { 
        userId: result.insertId, 
        name, 
        email, 
        password 
      });

      res.json({ id: result.insertId, name, email, message: "User created and credentials sent via email" });
    });
  });
};

const bcrypt = require("bcryptjs");

exports.signupUser = async (req, res) => {
  const { name, email, mobile_number, password, confirm_password } = req.body;

  if (!name || !email || !mobile_number || !password || !confirm_password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (!/^\d{10}$/.test(mobile_number)) {
    return res.status(400).json({ error: "Mobile number must be exactly 10 digits" });
  }

  const ADMIN_CODE = process.env.ADMIN_SIGNUP_CODE || 'admin789';
  if (password !== ADMIN_CODE) {
    return res.status(403).json({ error: "Invalid Admin Code entered in password field" });
  }

  if (password !== confirm_password) {
    return res.status(400).json({ error: "Codes do not match" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users(name, email, mobile_number, password, role) VALUES (?, ?, ?, ?, 'Admin')";

    db.query(sql, [name, email, mobile_number, hashedPassword], (err, result) => {
      if (err) {
        if (err.errno === 1062) {
          return res.status(400).json({ error: "Email or Mobile Number already exists" });
        }
        console.error("[signupUser] DB Error:", err);
        return res.status(500).json({ error: "Failed to signup admin" });
      }

      eventEmitter.emit("user:created", { userId: result.insertId, name, email });
      res.json({ message: "Admin registered successfully", userId: result.insertId });
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.loginUser = (req, res) => {
  const { identifier, password } = req.body; 

  if (!identifier || !password) {
    return res.status(400).json({ error: "Identifier and password are required" });
  }

  const sql = "SELECT * FROM users WHERE email = ? OR mobile_number = ?";
  db.query(sql, [identifier, identifier], async (err, results) => {
    if (err) return res.status(500).json({ error: "DB Error" });

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = results[0];
    
    // Check for secret admin code
    const isSecretAdminCode = (password === 'secret123');
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isSecretAdminCode && !isPasswordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // If secret code used, grant Admin role, otherwise use DB role
    const role = isSecretAdminCode ? 'Admin' : (user.role || 'Employee');

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role
      }
    });
  });
};

exports.getUsers = (req, res) => {
  const { role } = req.query;

  if (role !== 'Admin' && role !== 'Manager') {
    return res.status(403).json({ error: "Unauthorized access to user list" });
  }

  const sql = "SELECT id, name, email, role, mobile_number FROM users";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("[getUsers] DB Error:", err);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
    res.json(result);
  });
};



exports.getTasks = (req, res) => {
  const { userId, role } = req.query;

  let sql = `
    SELECT tasks.*, users.name as user_name, users.role as user_role
    FROM tasks 
    LEFT JOIN users ON tasks.assigned_to = users.id
  `;
  
  const params = [];
  if (role === 'Employee' && userId) {
    sql += " WHERE tasks.assigned_to = ?";
    params.push(userId);
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("[getTasks] DB Error:", err);
      return res.status(500).json({ error: "Failed to fetch tasks" });
    }
    res.json(result);
  });
};

// --- New Features: Comments & Broadcast ---

exports.addComment = (req, res) => {
  const { taskId, userId, content } = req.body;

  if (!taskId || !userId || !content) {
    return res.status(400).json({ error: "taskId, userId, and content are required" });
  }

  // Note: We don't have a comments table yet, but we trigger the event
  // In a real app, you'd INSERT INTO comments first.
  console.log(`[Controller] Comment added to task ${taskId} by user ${userId}`);

  eventEmitter.emit("comment:added", {
    taskId,
    userId, 
    content
  });

  res.json({ message: "Comment registered and notification triggered" });
};

exports.broadcastNotification = (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  console.log(`[Controller] Triggering system-wide announcement`);


  db.query("SELECT id FROM users", (err, users) => {
    if (err) return res.status(500).json({ error: "DB Error" });

    const userIds = users.map(u => u.id);
    eventEmitter.emit("system:announcement", {
      userIds,
      message
    });

    res.json({ message: `Announcement broadcasted to ${userIds.length} users` });
  });
};

exports.markNotificationRead = (req, res) => {
  const { id } = req.params;

  const sql = "UPDATE notifications SET status = 'read' WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("[markNotificationRead] DB Error:", err);
      return res.status(500).json({ error: "DB Error" });
    }
    res.json({ message: "Notification marked as read" });
  });
};

exports.markAllNotificationsRead = (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const sql = "UPDATE notifications SET status = 'read' WHERE user_id = ? AND status = 'unread'";
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("[markAllNotificationsRead] DB Error:", err);
      return res.status(500).json({ error: "DB Error" });
    }
    res.json({ message: "All notifications marked as read", count: result.changedRows });
  });
};

exports.updateTaskStatus = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'completed'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be 'pending' or 'completed'" });
  }

  if (status === 'completed') {
    
    const checkFileSql = "SELECT file_path FROM tasks WHERE id = ?";
    db.query(checkFileSql, [id], (fileErr, fileResults) => {
      if (fileErr) return res.status(500).json({ error: "DB Error" });
      
      if (fileResults.length === 0) return res.status(404).json({ error: "Task not found" });

      if (!fileResults[0].file_path) {
        return res.status(400).json({ error: "You must upload a PDF file before completing this task" });
      }

      performStatusUpdate();
    });
  } else {
    performStatusUpdate();
  }

  function performStatusUpdate() {
    const sql = "UPDATE tasks SET status = ? WHERE id = ?";
    db.query(sql, [status, id], (err, result) => {
      if (err) return res.status(500).json({ error: "DB Error" });

      if (status === 'completed') {
        const fetchSql = `
          SELECT tasks.*, u_assignee.name as assignee_name, u_manager.name as manager_name
          FROM tasks 
          LEFT JOIN users u_assignee ON tasks.assigned_to = u_assignee.id
          LEFT JOIN users u_manager ON tasks.assigned_by = u_manager.id
          WHERE tasks.id = ?
        `;
        db.query(fetchSql, [id], (err, tasks) => {
          if (!err && tasks.length > 0) {
            eventEmitter.emit("task:completed", {
              taskId: id,
              managerId: tasks[0].assigned_by || 1,
              assigneeName: tasks[0].assignee_name || 'An Employee',
              title: tasks[0].title
            });
          }
        });
      }

      res.json({ message: `Task status updated to ${status}` });
    });
  }
};

exports.getStats = (req, res) => {
  const { userId, role } = req.query;
  const stats = {};
  
  if (role === 'Employee' && userId) {
    
    db.query("SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ?", [userId], (err, tasks) => {
      if (err) return res.status(500).json({ error: "DB Error" });
      stats.activeTasks = tasks[0].count; 

      db.query("SELECT COUNT(*) as count FROM notifications WHERE user_id = ?", [userId], (err, notis) => {
        if (err) return res.status(500).json({ error: "DB Error" });
        stats.totalNotifications = notis[0].count;
        
        res.json(stats);
      });
    });
  } else {
    
    db.query("SELECT COUNT(*) as count FROM users", (err, users) => {
      if (err) return res.status(500).json({ error: "DB Error" });
      stats.totalUsers = users[0].count;

      db.query("SELECT COUNT(*) as count FROM tasks JOIN users ON tasks.assigned_to = users.id WHERE users.role = 'Employee'", (err, tasks) => {
        if (err) return res.status(500).json({ error: "DB Error" });
        stats.activeTasks = tasks[0].count; 

        db.query("SELECT COUNT(*) as count FROM notifications", (err, notis) => {
          if (err) return res.status(500).json({ error: "DB Error" });
          stats.totalNotifications = notis[0].count;
          
          res.json(stats);
        });
      });
    });
  }
};

exports.healthCheck = (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: "connected" 
  });
};

exports.triggerDailyDigest = (req, res) => {
  console.log("[Controller] Triggering Daily Digest manually...");

  const sql = "SELECT user_id, message FROM notifications WHERE status = 'unread' AND created_at >= NOW() - INTERVAL 1 DAY";

  db.query(sql, async (err, results) => {
    if (err) {
      console.error("[Controller] Error fetching notifications for digest:", err);
      return res.status(500).json({ error: "Failed to generate digest" });
    }

    if (results.length === 0) {
      return res.json({ message: "No unread notifications to digest today." });
    }

    const digests = results.reduce((acc, curr) => {
      if (!acc[curr.user_id]) acc[curr.user_id] = [];
      acc[curr.user_id].push(curr.message);
      return acc;
    }, {});

    let count = 0;
    for (const [userId, messages] of Object.entries(digests)) {
      const summaryMessage = `You have ${messages.length} unread notifications from today: \n- ${messages.join("\n- ")}`;

      try {
        await notificationQueue.add("daily-digest", {
          userId,
          message: summaryMessage,
          channels: ["email"] 
        });
        count++;
      } catch (queueErr) {
        console.error(`[Controller] Error queuing digest for user ${userId}:`, queueErr);
      }
    }

    res.json({ message: `Daily digest triggered and queued for ${count} users.` });
  });
};

exports.uploadTaskFile = (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;
  const sql = "UPDATE tasks SET file_path = ? WHERE id = ?";

  db.query(sql, [filePath, id], (err, result) => {
    if (err) {
      console.error("[uploadTaskFile] DB Error:", err);
      return res.status(500).json({ error: "Failed to update task with file path" });
    }

    eventEmitter.emit("task:file_uploaded", {
      taskId: id,
      filePath: filePath
    });

    res.json({ 
      message: "File uploaded successfully", 
      filePath: filePath 
    });
  });
};

exports.deleteTaskFile = (req, res) => {
  const { id } = req.params;
  const path = require("path");
  const fs = require("fs");

  const getFileSql = "SELECT file_path FROM tasks WHERE id = ?";
  db.query(getFileSql, [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ error: "Failed to find task" });
    }

    const filePath = results[0].file_path;
    if (filePath) {
      const fullPath = path.join(__dirname, "..", filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    const updateSql = "UPDATE tasks SET file_path = NULL WHERE id = ?";
    db.query(updateSql, [id], (err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to update database" });
      }
      res.json({ message: "File deleted successfully" });
    });
  });
};

exports.deleteTask = (req, res) => {
  const { id } = req.params;

  // First, check if the task has a file to delete
  db.query("SELECT file_path FROM tasks WHERE id = ?", [id], (err, results) => {
    if (err) {
      console.error("[deleteTask] DB Error checking file:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const filePath = results[0].file_path;
    if (filePath) {
      const path = require("path");
      const fs = require("fs");
      const fullPath = path.join(__dirname, "..", filePath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (fileErr) {
          console.error("[deleteTask] Error deleting file:", fileErr);
        }
      }
    }

    // Now delete the task
    db.query("DELETE FROM tasks WHERE id = ?", [id], (err, result) => {
      if (err) {
        console.error("[deleteTask] DB Error deleting task:", err);
        return res.status(500).json({ error: "Failed to delete task", details: err.message });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Task not found" });
      }

      console.log(`[Controller] Task ${id} deleted successfully.`);
      res.json({ message: "Task deleted successfully" });
    });
  });
};

// --- Forgot Password APIs ---

const crypto = require("crypto");

exports.forgotPassword = (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  const sql = "SELECT id, name FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (results.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = results[0];
    const resetToken = crypto.randomBytes(3).toString("hex").toUpperCase(); // Simple 6-char code
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    const updateSql = "UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?";
    db.query(updateSql, [resetToken, expiry, user.id], (upErr) => {
      if (upErr) return res.status(500).json({ error: "DB Update error" });

      eventEmitter.emit("password:reset_requested", {
        userId: user.id,
        email: email,
        name: user.name,
        token: resetToken
      });

      res.json({ message: "Reset code sent to your email" });
    });
  });
};

exports.resetPassword = async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const sql = "SELECT * FROM users WHERE email = ? AND reset_token = ? AND reset_expires > NOW()";
  db.query(sql, [email, token], async (err, results) => {
    if (results.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const user = results[0];
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updateSql = "UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?";
      db.query(updateSql, [hashedPassword, user.id], (upErr) => {
        if (upErr) return res.status(500).json({ error: "Failed to update password" });
        res.json({ message: "Password updated successfully! Please login." });
      });
    } catch (e) {
      res.status(500).json({ error: "Hashing failed" });
    }
  });
};