require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const eventEmitter = require("./services/events");

const taskRoutes = require("./routes/taskRoutes");
const logger = require("./middleware/logger");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  }
});

const onlineUsers = new Map(); // userId -> socketId

io.on("connection", (socket) => {
  console.log(`[Socket] New connection: ${socket.id}`);

  socket.on("user_online", (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.userId = userId;
    console.log(`[Socket] User ${userId} is now online`);
    io.emit("update_online_users", Array.from(onlineUsers.keys()));
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      console.log(`[Socket] User ${socket.userId} disconnected`);
      io.emit("update_online_users", Array.from(onlineUsers.keys()));
    }
  });
});

eventEmitter.on("socket:notify", (data) => {
  io.emit("new_notification", data);
});

require("./services/notificationService"); // Register event listeners
require("./services/worker");              // Start background worker
require("./services/cronJobs");            // Start cron jobs

app.use(cors());
app.use(express.json());

// Updated static paths for reorganized structure
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(logger);

console.log("[Server] Registering /api routes...");
app.use("/api", taskRoutes);
console.log("[Server] /api routes registered.");

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.use((req, res) => {
  console.log(`[404 BUG-HUNT] ${req.method} ${req.url} - Request Body:`, req.body);
  res.status(404).json({ 
    error: "Route not found", 
    method: req.method, 
    path: req.url,
    message: "Ensure you are using the correct URL and method (POST/GET)"
  });
});

const PORT = process.env.PORT || 3001;

const startupServer = server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(` [SOCKET.IO] WebSocket server active`);
  console.log(` [FRONTEND] UI available at http://localhost:${PORT}`);
});

// Graceful Shutdown Implementation
const gracefulShutdown = (signal) => {
  console.log(`\n[Server] ${signal} signal received. Closing HTTP server...`);
  startupServer.close(() => {
    console.log("[Server] HTTP server closed.");
    // In a real app, you'd also close database connections here
    // For this project, mysql2 pool usually handles its own or can be closed if exported
    process.exit(0);
  });
  
  // Force close after 10s
  setTimeout(() => {
    console.error("[Server] Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));