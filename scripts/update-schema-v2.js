const db = require("../config/db");

const updateSchemaV2 = () => {
  const alterTasksFilePathQuery = `ALTER TABLE tasks ADD COLUMN file_path VARCHAR(255);`;

  db.query(alterTasksFilePathQuery, (err, result) => {
    if (err && err.errno !== 1060) {
      console.error("Error adding file_path column:", err.message);
    } else {
      console.log("file_path column added (or already exists).");
    }
    db.end();
  });
};

updateSchemaV2();
