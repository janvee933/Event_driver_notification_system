const eventEmitter = require("./events");
const { notificationQueue } = require("./queue");
const Notification = require("../models/Notification");

const saveToDb = async (userId, message) => {
  console.log(`[Database] Saving notification to DB for User ${userId}`);
  try {
    const noti = new Notification({ user_id: userId, message, status: 'unread' });
    await noti.save();
    return noti;
  } catch (err) {
    console.error("[Database] Error saving notification:", err);
    throw err;
  }
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

  try {
    await notificationQueue.add("send-notification", {
      userId,
      message,
      subject: "Your Account Credentials",
      channels: ["email"]
    });
    
    await saveToDb(userId, `Welcome ${name}! Your account was created by an admin.`);
  } catch (err) {
    await saveToDb(userId, message);
  }
});

eventEmitter.on("password:reset_requested", async (data) => {
  const { userId, email, name, token } = data;
  const message = `Hello ${name}, \n\nYou requested a password reset. Your reset code is: ${token} \nThis code is valid for 1 hour. \n\nIf you did not request this, please ignore this email.`;

  try {
    await notificationQueue.add("send-notification", {
      userId,
      message,
      subject: "Password Reset Request",
      channels: ["email"]
    });
  } catch (err) {
    console.error("[Event-Handler] Failed to queue password reset email");
  }
});

eventEmitter.on("task:completed", async (data) => {
  const { managerId, assigneeName, title } = data;
  const message = `Task Completed: ${assigneeName} has completed the task "${title}".`;

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