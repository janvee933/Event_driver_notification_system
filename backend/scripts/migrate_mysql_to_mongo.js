require('dotenv').config();
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

const User = require('./backend/models/User');
const Task = require('./backend/models/Task');
const Notification = require('./backend/models/Notification');

async function migrate() {
  let mysqlConnection;
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/task_systemm");
    console.log("Connected to MongoDB.");

    // Clear existing Mongo data to avoid duplicates on re-run
    await User.deleteMany({});
    await Task.deleteMany({});
    await Notification.deleteMany({});
    console.log("Cleared existing MongoDB data.");

    // 2. Connect to MySQL
    mysqlConnection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '#mysql@123456%#',
      database: 'task_systemm'
    });
    console.log("Connected to MySQL.");

    // 3. Migrate Users
    const [users] = await mysqlConnection.query('SELECT * FROM users');
    const userMap = {}; // Map MySQL ID -> MongoDB ObjectId

    for (const u of users) {
      const newUser = new User({
        name: u.name,
        email: u.email,
        mobile_number: u.mobile_number,
        password: u.password,
        role: u.role,
        reset_token: u.reset_token,
        reset_expires: u.reset_expires,
        createdAt: u.created_at || new Date()
      });
      await newUser.save();
      userMap[u.id] = newUser._id;
    }
    console.log(`Migrated ${users.length} users.`);

    // 4. Migrate Tasks
    const [tasks] = await mysqlConnection.query('SELECT * FROM tasks');
    for (const t of tasks) {
      const newTask = new Task({
        title: t.title,
        description: t.description,
        assigned_to: userMap[t.assigned_to] || null,
        assigned_by: userMap[t.assigned_by] || null,
        status: t.status,
        due_date: t.due_date,
        file_path: t.file_path,
        createdAt: t.created_at || new Date()
      });
      await newTask.save();
    }
    console.log(`Migrated ${tasks.length} tasks.`);

    // 5. Migrate Notifications
    const [notifications] = await mysqlConnection.query('SELECT * FROM notifications');
    for (const n of notifications) {
      const newNoti = new Notification({
        user_id: userMap[n.user_id],
        message: n.message,
        status: n.status,
        createdAt: n.created_at || new Date()
      });
      await newNoti.save();
    }
    console.log(`Migrated ${notifications.length} notifications.`);

    console.log("Migration completed successfully!");

  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    if (mysqlConnection) await mysqlConnection.end();
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
