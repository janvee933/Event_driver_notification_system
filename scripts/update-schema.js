const db = require("../config/db");

const updateSchema = () => {
  const alterTasksAssignedByQuery = `ALTER TABLE tasks ADD COLUMN assigned_by INT;`;

  db.query(alterTasksAssignedByQuery, (err, result) => {
    if (err && err.errno !== 1060) {
      console.error("Error adding assigned_by column:", err.message);
    } else {
      console.log("assigned_by column added (or already exists).");
    }
    db.end();
  });
};

updateSchema();
