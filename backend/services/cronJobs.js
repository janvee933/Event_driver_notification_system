const cron = require("node-cron");
const Notification = require("../models/Notification");
const Task = require("../models/Task");
const { notificationQueue } = require("./queue");

cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Starting Daily Digest Generation...");

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  try {
    const results = await Notification.find({
      status: 'unread',
      createdAt: { $gte: yesterday }
    });

    if (results.length === 0) {
      console.log("[Cron] No unread notifications for today.");
      return;
    }

    const digests = results.reduce((acc, curr) => {
      const uid = curr.user_id.toString();
      if (!acc[uid]) acc[uid] = [];
      acc[uid].push(curr.message);
      return acc;
    }, {});

    for (const [userId, messages] of Object.entries(digests)) {
      const summaryMessage = `You have ${messages.length} unread notifications from today: \n- ${messages.join("\n- ")}`;

      await notificationQueue.add("daily-digest", {
        userId,
        message: summaryMessage,
        channels: ["email"] 
      });

      console.log(`[Cron] Digest queued for User ${userId}`);
    }
  } catch (err) {
    console.error("[Cron] Error fetching notifications:", err);
  }
});

// Task Reminder at 9 AM
cron.schedule("0 9 * * *", async () => {
  console.log("[Cron] Starting Task Reminder Job...");

  try {
    const pendingTasks = await Task.find({ status: 'pending' }).populate('assigned_to', 'name');

    if (pendingTasks.length === 0) {
      console.log("[Cron] No pending tasks found.");
      return;
    }

    for (const task of pendingTasks) {
      if (task.assigned_to) {
        const message = `Reminder: You have a pending task: "${task.title}"`;
        
        await notificationQueue.add("task-reminder", {
          userId: task.assigned_to._id.toString(),
          message,
          channels: ["in-app", "push"]
        });

        console.log(`[Cron] Reminder queued for User ${task.assigned_to._id.toString()} regarding task: ${task.title}`);
      }
    }
  } catch (err) {
    console.error("[Cron] Error fetching pending tasks:", err);
  }
});

console.log("Cron Jobs scheduled...");
