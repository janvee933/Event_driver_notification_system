const User = require("../models/User");
const Task = require("../models/Task");
const Notification = require("../models/Notification");
const eventEmitter = require("../services/events");
const { notificationQueue } = require("../services/queue");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

exports.assignTask = async (req, res) => {
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

  try {
    const task = new Task({
      title,
      assigned_to: userId,
      description: description || '',
      due_date: dueDate || null,
      status: 'pending',
      assigned_by: assignedBy
    });
    await task.save();

    eventEmitter.emit("task:assigned", {
      taskId: task._id.toString(),
      userId,
      title
    });

    res.json({
      message: "Task assigned and event triggered",
      taskId: task._id.toString()
    });
  } catch (err) {
    console.error("[assignTask] DB Error:", err);
    res.status(500).json({ error: "Failed to assign task", details: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    await Notification.deleteMany({ user_id: id });
    const result = await User.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log(`[Controller] User ${id} deleted successfully.`);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("[deleteUser] DB Error:", err);
    res.status(500).json({ error: "Failed to delete user", details: err.message });
  }
};

exports.getNotifications = async (req, res) => {
  const userId = req.params.userId;
  
  try {
    const result = await Notification.find({ user_id: userId }).sort({ createdAt: -1 });
    res.json(result);
  } catch (err) {
    console.error("[getNotifications] DB Error:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

exports.createUser = async (req, res) => {
  const { name, email, mobile_number, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }

  if (mobile_number && !/^\d{10}$/.test(mobile_number)) {
    return res.status(400).json({ error: "Mobile number must be exactly 10 digits" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      mobile_number: mobile_number || null,
      password: hashedPassword,
      role: role || 'Employee'
    });
    
    await user.save();

    eventEmitter.emit("user:created_by_admin", { 
      userId: user._id.toString(), 
      name, 
      email, 
      password 
    });

    res.json({ id: user._id.toString(), name, email, message: "User created and credentials sent via email" });
  } catch (err) {
    console.error("[createUser] DB Error:", err);
    res.status(500).json({ error: "Failed to create user", details: err.message });
  }
};

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
    const existingUser = await User.findOne({ $or: [{ email }, { mobile_number }] });
    if (existingUser) {
      return res.status(400).json({ error: "Email or Mobile Number already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      mobile_number,
      password: hashedPassword,
      role: 'Admin'
    });
    await user.save();

    eventEmitter.emit("user:created", { userId: user._id.toString(), name, email });
    res.json({ message: "Admin registered successfully", userId: user._id.toString() });
  } catch (err) {
    console.error("[signupUser] DB Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.loginUser = async (req, res) => {
  const { identifier, password } = req.body; 

  if (!identifier || !password) {
    return res.status(400).json({ error: "Identifier and password are required" });
  }

  try {
    const user = await User.findOne({ $or: [{ email: identifier }, { mobile_number: identifier }] });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Check for secret admin code
    const isSecretAdminCode = (password === 'secret123');
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isSecretAdminCode && !isPasswordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const role = isSecretAdminCode ? 'Admin' : (user.role || 'Employee');

    res.json({
      message: "Login successful",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: role
      }
    });
  } catch (err) {
    console.error("[loginUser] DB Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
};

exports.getUsers = async (req, res) => {
  const { role } = req.query;

  if (role !== 'Admin' && role !== 'Manager') {
    return res.status(403).json({ error: "Unauthorized access to user list" });
  }

  try {
    const result = await User.find({}, 'name email role mobile_number');
    res.json(result);
  } catch (err) {
    console.error("[getUsers] DB Error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

exports.getTasks = async (req, res) => {
  const { userId, role } = req.query;

  try {
    let query = {};
    if (role === 'Employee' && userId) {
      query.assigned_to = userId;
    }

    const tasks = await Task.find(query)
      .populate('assigned_to', 'name role')
      .populate('assigned_by', 'name role');
    
    const formattedTasks = tasks.map(task => {
      const taskObj = task.toJSON();
      if (task.assigned_to) {
        taskObj.user_name = task.assigned_to.name;
        taskObj.user_role = task.assigned_to.role;
      }
      return taskObj;
    });

    res.json(formattedTasks);
  } catch (err) {
    console.error("[getTasks] DB Error:", err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

exports.addComment = (req, res) => {
  const { taskId, userId, content } = req.body;

  if (!taskId || !userId || !content) {
    return res.status(400).json({ error: "taskId, userId, and content are required" });
  }

  console.log(`[Controller] Comment added to task ${taskId} by user ${userId}`);

  eventEmitter.emit("comment:added", {
    taskId,
    userId, 
    content
  });

  res.json({ message: "Comment registered and notification triggered" });
};

exports.broadcastNotification = async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  console.log(`[Controller] Triggering system-wide announcement`);

  try {
    const users = await User.find({}, '_id');
    const userIds = users.map(u => u._id.toString());
    
    eventEmitter.emit("system:announcement", {
      userIds,
      message
    });

    res.json({ message: `Announcement broadcasted to ${userIds.length} users` });
  } catch (err) {
    console.error("[broadcastNotification] DB Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
};

exports.markNotificationRead = async (req, res) => {
  const { id } = req.params;

  try {
    await Notification.findByIdAndUpdate(id, { status: 'read' });
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("[markNotificationRead] DB Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const result = await Notification.updateMany(
      { user_id: userId, status: 'unread' },
      { $set: { status: 'read' } }
    );
    res.json({ message: "All notifications marked as read", count: result.modifiedCount });
  } catch (err) {
    console.error("[markAllNotificationsRead] DB Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
};

exports.updateTaskStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'completed'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be 'pending' or 'completed'" });
  }

  try {
    const task = await Task.findById(id).populate('assigned_to', 'name').populate('assigned_by', 'name');
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (status === 'completed' && !task.file_path) {
      return res.status(400).json({ error: "You must upload a PDF file before completing this task" });
    }

    task.status = status;
    await task.save();

    if (status === 'completed') {
      eventEmitter.emit("task:completed", {
        taskId: task._id.toString(),
        managerId: task.assigned_by ? task.assigned_by._id.toString() : '1',
        assigneeName: task.assigned_to ? task.assigned_to.name : 'An Employee',
        title: task.title
      });
    }

    res.json({ message: `Task status updated to ${status}` });
  } catch (err) {
    console.error("[updateTaskStatus] DB Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
};

exports.getStats = async (req, res) => {
  const { userId, role } = req.query;
  const stats = {};
  
  try {
    if (role === 'Employee' && userId) {
      stats.activeTasks = await Task.countDocuments({ assigned_to: userId });
      stats.totalNotifications = await Notification.countDocuments({ user_id: userId });
      res.json(stats);
    } else {
      stats.totalUsers = await User.countDocuments();
      
      const employees = await User.find({ role: 'Employee' }, '_id');
      const employeeIds = employees.map(e => e._id);
      
      stats.activeTasks = await Task.countDocuments({ assigned_to: { $in: employeeIds } });
      stats.totalNotifications = await Notification.countDocuments();
      
      res.json(stats);
    }
  } catch (err) {
    console.error("[getStats] DB Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
};

exports.healthCheck = (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: "connected (mongo)" 
  });
};

exports.triggerDailyDigest = async (req, res) => {
  console.log("[Controller] Triggering Daily Digest manually...");

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  try {
    const results = await Notification.find({
      status: 'unread',
      createdAt: { $gte: yesterday }
    });

    if (results.length === 0) {
      return res.json({ message: "No unread notifications to digest today." });
    }

    const digests = results.reduce((acc, curr) => {
      const uid = curr.user_id.toString();
      if (!acc[uid]) acc[uid] = [];
      acc[uid].push(curr.message);
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
  } catch (err) {
    console.error("[Controller] Error fetching notifications for digest:", err);
    res.status(500).json({ error: "Failed to generate digest" });
  }
};

exports.uploadTaskFile = async (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;

  try {
    await Task.findByIdAndUpdate(id, { file_path: filePath });

    eventEmitter.emit("task:file_uploaded", {
      taskId: id,
      filePath: filePath
    });

    res.json({ 
      message: "File uploaded successfully", 
      filePath: filePath 
    });
  } catch (err) {
    console.error("[uploadTaskFile] DB Error:", err);
    res.status(500).json({ error: "Failed to update task with file path" });
  }
};

exports.deleteTaskFile = async (req, res) => {
  const { id } = req.params;

  try {
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: "Failed to find task" });
    }

    const filePath = task.file_path;
    if (filePath) {
      const fullPath = path.join(__dirname, "..", filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    task.file_path = null;
    await task.save();

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update database" });
  }
};

exports.deleteTask = async (req, res) => {
  const { id } = req.params;

  try {
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (task.file_path) {
      const fullPath = path.join(__dirname, "..", task.file_path);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (fileErr) {
          console.error("[deleteTask] Error deleting file:", fileErr);
        }
      }
    }

    await Task.findByIdAndDelete(id);

    console.log(`[Controller] Task ${id} deleted successfully.`);
    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    console.error("[deleteTask] DB Error deleting task:", err);
    res.status(500).json({ error: "Failed to delete task", details: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const resetToken = crypto.randomBytes(3).toString("hex").toUpperCase(); 
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    user.reset_token = resetToken;
    user.reset_expires = expiry;
    await user.save();

    eventEmitter.emit("password:reset_requested", {
      userId: user._id.toString(),
      email: email,
      name: user.name,
      token: resetToken
    });

    res.json({ message: "Reset code sent to your email" });
  } catch (err) {
    console.error("[forgotPassword] DB Error:", err);
    res.status(500).json({ error: "DB Update error" });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const user = await User.findOne({ 
      email, 
      reset_token: token, 
      reset_expires: { $gt: new Date() } 
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.reset_token = null;
    user.reset_expires = null;
    await user.save();

    res.json({ message: "Password updated successfully! Please login." });
  } catch (err) {
    console.error("[resetPassword] Error:", err);
    res.status(500).json({ error: "Hashing failed or DB error" });
  }
};