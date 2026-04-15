const { Queue } = require("bullmq");
const EventEmitter = require("events");

class MockQueue extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.jobs = [];
    this.isPaused = false;
  }

  async add(jobName, data, opts = {}) {
    // Mock job object that mimics BullMQ job
    const job = {
      id: Math.random().toString(36).substr(2, 9),
      name: jobName,
      data,
      attempts: 0,
      timestamp: Date.now(),
      opts: {
        attempts: opts.attempts || 3,
        backoff: opts.backoff || { type: 'exponential', delay: 1000 }
      }
    };
   
    this._dispatch(job);
    return job;
  }

  _dispatch(job) {
    setImmediate(async () => {
      try {
        const listeners = this.listeners("job:added");
        for (const listener of listeners) {
          await listener(job);
        }
      } catch (err) {
        job.attempts++;
        if (job.attempts < job.opts.attempts) {
          const delay = job.opts.backoff.delay * Math.pow(2, job.attempts - 1);
          console.warn(`[Queue] (MOCK) Job ${job.id} failed. Retrying (${job.attempts}/${job.opts.attempts}) in ${delay}ms...`);
          setTimeout(() => this._dispatch(job), delay);
        }
      }
    });
  }
}

let notificationQueue;
let isRedisAvailable = false;

if (process.env.REDIS_URL) {
  try {
    notificationQueue = new Queue("notifications", {
      connection: { url: process.env.REDIS_URL }
    });
    isRedisAvailable = true;
    console.log("[Queue] BullMQ initialized with Redis.");
  } catch (err) {
    console.error("[Queue] Failed to initialize BullMQ, falling back to MockQueue:", err.message);
    notificationQueue = new MockQueue("notifications");
  }
} else {
  notificationQueue = new MockQueue("notifications");
  console.log("[Queue] REDIS_URL not found. Using MockQueue.");
}

module.exports = {
  notificationQueue,
  isRedisAvailable 
};
