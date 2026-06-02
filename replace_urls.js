const fs = require('fs');
const path = require('path');

const files = [
  'frontend/user.js',
  'frontend/user.html',
  'frontend/script.js',
  'frontend/admin.js',
  'frontend/admin.html'
];

const oldUrl = 'http://localhost:3002';
const newUrl = 'https://event-driver-notification-system.onrender.com';

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.split(oldUrl).join(newUrl);
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${file}`);
  }
});
console.log("Done");
