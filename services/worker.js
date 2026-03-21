const { notificationQueue } = require("./queue");
const db = require("../config/db");
const nodemailer = require("nodemailer");
const eventEmitter = require("./events");

// Simple Worker for Redis-free environment
console.log("[Worker] Local In-Memory Worker initialized.");

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

console.log("[Worker] Email transporter initialized with SMTP configuration.");

notificationQueue.on("job:added", async (job) => {
  const { userId, message, channels, subject: customSubject } = job.data;

  console.log(`[Worker] Received job ${job.id} for User ${userId}`);

  const promises = [];

  // Channel: In-App
  if (channels.includes("in-app")) {
    promises.push(new Promise((resolve, reject) => {
      const sql = "INSERT INTO notifications(user_id, message, status, email_status) VALUES (?, ?, ?, ?)";
      db.query(sql, [userId, message, "unread", "not_sent"], (err, res) => {
        if (err) {
          console.error(`[Worker] Database error (In-App): ${err.message}`);
          return reject(err);
        }
        console.log(`[Worker] In-app notification delivered to DB for User ${userId}`);
        
        // Save the notification ID for potential email status update
        job.data.notificationId = res.insertId;
        
        // Emit socket notification event for real-time UI updates
        eventEmitter.emit("socket:notify", {
          id: res.insertId,
          userId,
          message,
          created_at: new Date().toISOString(),
          status: "unread"
        });
        
        resolve();
      });
    }));
  }

  // Channel: Email
  if (channels.includes("email")) {
    promises.push(new Promise((resolve, reject) => {
      // Ensure in-app promise (which inserts into DB) finished so we have notificationId
      // Or if only email channel, we might need a different approach.
      // For now, let's assume in-app is usually present or we insert a record if not.
      
      const updateEmailStatus = (id, status) => {
        if (!id) return;
        db.query("UPDATE notifications SET email_status = ? WHERE id = ?", [status, id], (err) => {
          if (err) console.error(`[Worker] Failed to update email status for ID ${id}:`, err);
          else console.log(`[Worker] Email status updated to '${status}' for notification ${id}`);
        });
      };

      db.query("SELECT name, email FROM users WHERE id = ?", [userId], (err, users) => {
        if (err) {
          console.error(`[Worker] Database error (Email lookup): ${err.message}`);
          return reject(err);
        }
        if (users.length === 0) {
          console.warn(`[Worker] User ${userId} not found. Skipping email.`);
          return resolve();
        }

        const user = users[0];
        
        if (!transporter) {
          console.warn("[Worker] Email transporter not ready.");
          return reject(new Error("Transporter not ready"));
        }

        const subject = job.name === "daily-digest" 
            ? "Your Daily Notification Digest" 
            : (customSubject || "New Task Assignment & Notification");

        const formattedHtml = job.name === "daily-digest"
            ? `<p>Hi <b>${user.name}</b>,</p><p>${message.replace(/\n/g, "<br>")}</p><p>Check your dashboard for details.</p>`
            : `<p>Hi <b>${user.name}</b>,</p><p>${message}</p><p>Please check your dashboard.</p>`;

        const mailOptions = {
          from: `"Task Manager" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject,
          text: `Hi ${user.name},\n\n${message}\n\nPlease check your dashboard.`,
          html: formattedHtml
        };
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.log("[Worker] Error sending email:", error);
            updateEmailStatus(job.data.notificationId, "failed");
            reject(error);
          } else {
            console.log(`[Worker] Email sent to ${user.email}. Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
            updateEmailStatus(job.data.notificationId, "sent");
            resolve();
          }
        });
      });
    }));
  }

  // Channel: Push (Simulated)
  if (channels.includes("push")) {
    promises.push(new Promise((resolve) => {
      console.log(`[Worker] [SIMULATED PUSH] To: User ${userId}, Message: ${message}`);
      resolve();
    }));
  }

  // Await all channels; if any rejects, the queue catches the throw and triggers retry.
  await Promise.all(promises);
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

module.exports = {}; // Exporting empty object as it listens to events
