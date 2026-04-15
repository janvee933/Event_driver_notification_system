require("dotenv").config();
const mysql = require("mysql2");

const dbConfig = process.env.DATABASE_URL || {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
};

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
  if (err) {
    console.log("Database connection error:", err);
  } else {
    console.log("Database connected");
  }
});

module.exports = db;