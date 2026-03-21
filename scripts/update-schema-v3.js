const db = require("../config/db");

const updateSchemaV3 = () => {
  const alterUsersResetTokenQuery = `ALTER TABLE users ADD COLUMN reset_token VARCHAR(255), ADD COLUMN reset_expires DATETIME;`;

  db.query(alterUsersResetTokenQuery, (err, result) => {
    if (err && err.errno !== 1060) {
      console.error("Error adding reset_token columns:", err.message);
    } else {
      console.log("reset_token and reset_expires columns added (or already exists).");
    }
    db.end();
  });
};

updateSchemaV3();
