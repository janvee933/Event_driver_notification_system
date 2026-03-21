const eventEmitter = require("./events");
const { notificationQueue } = require("./queue");
const db = require("../config/db");

const saveToDb = async (userId, message) => {
  console.log(`[Database] Saving notification to DB for User ${userId}`);
  const sql = "INSERT INTO notifications(user_id, message, status) VALUES (?, ?, ?)";
  return new Promise((resolve, reject) => {
    db.query(sql, [userId, message, "unread"], (err, res) => {
      if (err) {
        console.error("[Database] Error saving notification:", err);
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
};

eventEmitter.on("task:assigned", async (data) => {
  const { userId, title } = data;
  const message = `You have been assigned task: ${title}`;

  console.log(`[Event-Handler] Notification triggered for task: ${title}`);
  try {
   
    await notificationQueue.add("send-notification", {
      userId,
      message,
      subject: `New Task Assigned: ${title}`,
      channels: ["in-app", "email"]
    });
  } catch (err) {
    console.warn("[Event-Handler] Queue failed. Falling back to direct DB insert.");
    await saveToDb(userId, message);
  }
});

eventEmitter.on("comment:added", async (data) => {
  const { taskId, userId, content } = data;
  const message = `New comment on task ${taskId}: "${content}"`;

  console.log(`[Event-Handler] Notification triggered for comment on task: ${taskId}`);
  try {
    await notificationQueue.add("comment-notification", {
      userId, 
      message,
      channels: ["in-app"]
    });
  } catch (err) {
    await saveToDb(userId, message);
  }
});


eventEmitter.on("system:announcement", async (data) => {
  const { userIds, message } = data;
  console.log(`[Event-Handler] Fan-out announcement to ${userIds.length} users`);

  for (const userId of userIds) {
    try {
      await notificationQueue.add("send-notification", {
        userId,
        message,
        subject: "System Broadcast Notification",
        channels: ["in-app", "email"]
      });
    } catch (err) {
      await saveToDb(userId, message);
    }
  }
});


eventEmitter.on("user:created", async (data) => {
  const { userId, name } = data;
  const message = `Welcome to our system, ${name}! We're glad to have you here.`;

  console.log(`[Event-Handler] Welcome notification triggered for user: ${name}`);
  try {
    await notificationQueue.add("welcome-notification", {
      userId,
      message,
      subject: "Welcome to our system!",
      channels: ["in-app", "email"]
    });
  } catch (err) {
    await saveToDb(userId, message);
  }
});

eventEmitter.on("user:created_by_admin", async (data) => {
  const { userId, name, email, password } = data;
  const message = `Welcome ${name}! Your account has been created by an administrator. \nUsername: ${email} \nPassword: ${password} \nPlease login and change your password for security.`;

  console.log(`[Event-Handler] Admin user creation notification triggered for user: ${name}`);
  try {
    await notificationQueue.add("send-notification", {
      userId,
      message,
      subject: "Your Account Credentials",
      channels: ["email"]
    });
    // Also save an in-app welcome
    await saveToDb(userId, `Welcome ${name}! Your account was created by an admin.`);
  } catch (err) {
    await saveToDb(userId, message);
  }
});

eventEmitter.on("password:reset_requested", async (data) => {
  const { userId, email, name, token } = data;
  const message = `Hello ${name}, \n\nYou requested a password reset. Your reset code is: ${token} \nThis code is valid for 1 hour. \n\nIf you did not request this, please ignore this email.`;

  console.log(`[Event-Handler] Password reset notification triggered for user: ${name}`);
  try {
    await notificationQueue.add("send-notification", {
      userId,
      message,
      subject: "Password Reset Request",
      channels: ["email"]
    });
  } catch (err) {
    // For forgot password, we don't save to in-app DB usually, just email
    console.error("[Event-Handler] Failed to queue password reset email");
  }
});


eventEmitter.on("task:completed", async (data) => {
  const { managerId, assigneeName, title } = data;
  const message = `Task Completed: ${assigneeName} has completed the task "${title}".`;

  console.log(`[Event-Handler] Completion notification triggered for task: ${title} to manager ${managerId}`);
  try {
    await notificationQueue.add("task-completion", {
      userId: managerId,
      message,
      subject: `Task Completed: ${title}`,
      channels: ["in-app", "email"]
    });
  } catch (err) {
    await saveToDb(managerId, message);
  }
});

module.exports = {
  createNotification: async (userId, message, channels = ["in-app"]) => {
    try {
      await notificationQueue.add("direct-notification", { userId, message, channels });
    } catch (err) {
      await saveToDb(userId, message);
    }
  }
};