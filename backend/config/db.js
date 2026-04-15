require("dotenv").config();
const mysql = require("mysql2");

// Use a connection string if available, otherwise use individual config objects
const dbConfig = process.env.DATABASE_URL || {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create a pool for better performance and stability in production
const db = mysql.createPool(dbConfig);

// Test connection on startup
db.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection error:", err.message);
  } else {
    console.log("Database connected (Connection Pool)");
    connection.release();
  }
});

module.exports = db;