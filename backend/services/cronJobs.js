const cron = require("node-cron");
const db = require("../config/db");
const { notificationQueue } = require("./queue");


cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Starting Daily Digest Generation...");

  
  const sql = "SELECT user_id, message FROM notifications WHERE status = 'unread' AND created_at >= NOW() - INTERVAL 1 DAY";

  db.query(sql, async (err, results) => {
    if (err) {
      console.error("[Cron] Error fetching notifications:", err);
      return;
    }

    if (results.length === 0) {
      console.log("[Cron] No unread notifications for today.");
      return;
    }

   
    const digests = results.reduce((acc, curr) => {
      if (!acc[curr.user_id]) acc[curr.user_id] = [];
      acc[curr.user_id].push(curr.message);
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
  });
});

// Task Reminder at 9 AM
cron.schedule("0 9 * * *", async () => {
  console.log("[Cron] Starting Task Reminder Job...");

  const sql = `
    SELECT u.id as userId, u.name, t.title 
    FROM tasks t 
    JOIN users u ON t.assigned_to = u.id 
    WHERE t.status = 'pending'
  `;

  db.query(sql, async (err, results) => {
    if (err) {
      console.error("[Cron] Error fetching pending tasks:", err);
      return;
    }

    if (results.length === 0) {
      console.log("[Cron] No pending tasks found.");
      return;
    }

    for (const row of results) {
      const message = `Reminder: You have a pending task: "${row.title}"`;
      
      await notificationQueue.add("task-reminder", {
        userId: row.userId,
        message,
        channels: ["in-app", "push"]
      });

      console.log(`[Cron] Reminder queued for User ${row.userId} regarding task: ${row.title}`);
    }
  });
});

console.log("Cron Jobs scheduled...");
