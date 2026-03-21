const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure Multer for PDF uploads (2MB to 1GB)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"), false);
    }
    cb(null, true);
  }
});


const {
  assignTask,
  getNotifications,
  createUser,
  getUsers,
  getTasks,
  addComment,
  broadcastNotification,
  markNotificationRead,
  markAllNotificationsRead,
  updateTaskStatus,
  getStats,
  healthCheck,
  triggerDailyDigest,
  deleteUser,
  uploadTaskFile,
  deleteTaskFile,
  signupUser,
  loginUser,
  forgotPassword,
  resetPassword
} = require("../controllers/taskController");





router.post("/assign-task", assignTask);
router.post("/tasks", assignTask);
router.get("/notifications/:userId", getNotifications);
router.put("/notifications/:id/read", markNotificationRead);
router.post("/notifications/read-all", markAllNotificationsRead);


router.post("/users", createUser);
router.get("/users", getUsers);
router.delete("/users/:id", deleteUser);

router.post("/signup", signupUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);



router.get("/tasks", getTasks);
router.put("/tasks/:id/status", updateTaskStatus);
router.post("/tasks/comment", addComment);
router.post("/comment", addComment); 

// File Upload Route
router.post("/tasks/:id/upload", (req, res, next) => {
  upload.single("taskFile")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File size exceeds 1GB limit" });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    // Minimum size check (2MB)
    if (req.file && req.file.size < 2 * 1024 * 1024) {
      // Delete the file if it's too small
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "File size must be at least 2MB" });
    }
    
    next();
  });
}, uploadTaskFile);

router.delete("/tasks/:id/upload", deleteTaskFile);


router.post("/system/broadcast", broadcastNotification);
router.post("/broadcast", broadcastNotification); 
router.post("/announcement", broadcastNotification); 

router.get("/stats", getStats);
router.get("/health", healthCheck);
router.post("/test/daily-digest", triggerDailyDigest);

module.exports = router;