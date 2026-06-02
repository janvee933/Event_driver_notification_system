const { notificationQueue } = require("./queue");
const Notification = require("../models/Notification");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const eventEmitter = require("./events");

// Simple Worker for Redis-free environment
console.log("[Worker] Local In-Memory Worker initialized.");

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_PORT == 465,
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
  let notificationId = null;

  if (channels.includes("in-app")) {
    promises.push(new Promise(async (resolve, reject) => {
      try {
        const noti = new Notification({
          user_id: userId,
          message,
          status: 'unread'
        });
        await noti.save();
        
        console.log(`[Worker] In-app notification delivered to DB for User ${userId}`);
        notificationId = noti._id;
        job.data.notificationId = notificationId;
        
        eventEmitter.emit("socket:notify", {
          id: noti._id.toString(),
          userId,
          message,
          created_at: noti.createdAt,
          status: "unread"
        });
        resolve();
      } catch (err) {
        console.error(`[Worker] Database error (In-App): ${err.message}`);
        reject(err);
      }
    }));
  }

  if (channels.includes("email")) {
    promises.push(new Promise(async (resolve, reject) => {
      try {
        const user = await User.findById(userId);
        if (!user) {
          console.warn(`[Worker] User ${userId} not found. Skipping email.`);
          return resolve();
        }

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
            reject(error);
          } else {
            console.log(`[Worker] Email sent to ${user.email}.`);
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    }));
  }

  if (channels.includes("push")) {
    promises.push(new Promise((resolve) => {
      console.log(`[Worker] [SIMULATED PUSH] To: User ${userId}, Message: ${message}`);
      resolve();
    }));
  }

  await Promise.all(promises);
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

module.exports = {};
