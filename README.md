# Scalable Event-Driven Notification System

A robust, production-ready notification architecture built with Node.js. This system decouples application events from the notification delivery logic, ensuring high performance and reliability.

  email VARCHAR(100)
);

CREATE TABLE tasks(
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200),
  assigned_to INT
);

CREATE TABLE notifications(
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  message TEXT,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🚀 Key Features

- **Event-Driven**: Uses a centralized `EventEmitter` to trigger notifications from anywhere in the app without tight coupling.
- **Asynchronous Processing**: Implements a "Background Worker" pattern. Even without Redis, it uses an In-Memory Queue to process alerts without blocking the main thread.
- **Multi-Channel Support**: Ready for In-App (Database), Email (Nodemailer), and Push notifications.
- **Fan-Out Capability**: One event (like a system announcement) can trigger notifications for hundreds of fans/users efficiently.
- **Daily Digest**: An automated cron job that aggregates unread alerts into a single summary.

## 🏗️ Architecture

1.  **Event Trigger**: A system action (e.g., `assignTask`) emits an event via `events.js`.
2.  **Event Listener**: `notificationService.js` catches the event and maps it to a notification message.
3.  **Job Queue**: The service adds the notification to `queue.js` (In-Memory).
4.  **Worker**: `worker.js` picks up the job and delivers it via the requested channels (In-app, Email, etc.).

## 🛠️ File Structure

- `services/events.js`: Central event bus.
- `services/queue.js`: In-memory job queue (Scalable to Redis/BullMQ).
- `services/worker.js`: Process jobs and handles delivery logic.
- `services/notificationService.js`: Defines what happens when events occur.
- `services/cronJobs.js`: Handles daily summary logic.

## 🧪 How to Test with Postman

### 1. Create a User
- **URL**: `http://localhost:3000/api/users`
- **Method**: `POST`
- **Body**:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

### 2. Assign a Task (Triggers Notification)
- **URL**: `http://localhost:3001/api/tasks`
- **Method**: `POST`
- **Body**:
```json
{
  "title": "Fix the background color",
  "userId": 1
}
```

### 3. View All Users
- **URL**: `http://localhost:3000/api/users`
- **Method**: `GET`

### 4. View All Tasks
- **URL**: `http://localhost:3000/api/tasks`
- **Method**: `GET`

### 6. Add a Comment (Triggers Notification)
- **URL**: `http://localhost:3001/api/comment`
- **Method**: `POST`
- **Body**:
```json
{
  "taskId": 1,
  "userId": 1,
  "content": "This is a very important update!"
}
```

### 7. Broadcast Announcement (Fan-out to Everyone)
- **URL**: `http://localhost:3001/api/broadcast` OR `http://localhost:3001/api/announcement`
- **Method**: `POST`
- **Body**:
```json
{
  "message": "The server will be down for maintenance at 10 PM."
}
```

### 8. Mark Notification as Read
- **URL**: `http://localhost:3000/api/notifications/1/read`
- **Method**: `PUT`

## 💡 Note on Redis

The system is currently running in **Redis-Free Mode**. It uses an internal queue to manage background tasks. To scale for heavy production loads, you can swap the implementation in `queue.js` to use **BullMQ** and a real Redis server.
