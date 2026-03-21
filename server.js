require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
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

// Broadcast real-time notifications
eventEmitter.on("socket:notify", (data) => {
  io.emit("new_notification", data);
});
// Initialize Notification System
require("./services/notificationService"); // Register event listeners
require("./services/worker");              // Start background worker
require("./services/cronJobs");            // Start cron jobs

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));


app.use(logger);

console.log("[Server] Registering /api routes...");
app.use("/api", taskRoutes);
console.log("[Server] /api routes registered.");


app.get("/", (req, res) => {
  res.send("Notification System Running");
});

// Diagnostic 404 handler
app.use((req, res) => {
  console.log(`[404 BUG-HUNT] ${req.method} ${req.url} - Request Body:`, req.body);
  res.status(404).json({ 
    error: "Route not found", 
    method: req.method, 
    path: req.url,
    message: "Ensure you are using the correct URL and method (POST/GET)"
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`--------------------------------------------------`);
  console.log(`🚀 [BACKEND] Server running on port ${PORT}`);
  console.log(`📡 [SOCKET.IO] WebSocket server active`);
  console.log(`🌐 [FRONTEND] UI available at http://localhost:${PORT}`);
  console.log(`--------------------------------------------------`);
});