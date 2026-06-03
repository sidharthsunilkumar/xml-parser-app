const { connectRabbit, QUEUES } = require("./lib/rabbitmq");

/** @type {Map<string, { sendEvent: Function, onComplete: Function|null, total: number, completed: number, totalSaved: number }>} */
const activeJobs = new Map();

let rabbitChannel = null;

function registerActiveJob(jobId, { sendEvent, total, onComplete }) {
  activeJobs.set(jobId, { sendEvent, onComplete: onComplete || null, total, completed: 0, totalSaved: 0 });
}

function unregisterActiveJob(jobId) {
  activeJobs.delete(jobId);
}

function handleProcessedMessage(payload) {
  const job = activeJobs.get(payload.jobId);
  if (!job) return;

  if (payload.type === "feed") {
    job.sendEvent("feed", {
      jobId: payload.jobId,
      taskId: payload.taskId,
      index: payload.index,
      url: payload.url,
      count: payload.count,
      records: payload.records,
    });
    job.totalSaved += payload.totalSaved || payload.count || 0;
  } else if (payload.type === "feed_error") {
    job.sendEvent("feed_error", {
      jobId: payload.jobId,
      taskId: payload.taskId,
      index: payload.index,
      url: payload.url,
      message: payload.message,
    });
  }

  job.completed += 1;
  if (job.completed >= job.total) {
    job.sendEvent("done", {
      jobId: payload.jobId,
      total: job.total,
      totalSaved: job.totalSaved,
    });
    if (job.onComplete) job.onComplete();
    unregisterActiveJob(payload.jobId);
  }
}

async function initQueueBridge() {
  const { connection, channel } = await connectRabbit();
  rabbitChannel = channel;

  channel.consume(QUEUES.PROCESSED, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      handleProcessedMessage(payload);
    } catch (err) {
      console.error("Failed to handle processed message:", err.message);
    }
    channel.ack(msg);
  });

  connection.on("close", () => {
    console.error("RabbitMQ connection closed");
    process.exit(1);
  });

  console.log(`Server listening on ${QUEUES.PROCESSED} for completed tasks`);
  return channel;
}

function enqueueTask(payload) {
  if (!rabbitChannel) throw new Error("RabbitMQ channel not ready");
  rabbitChannel.sendToQueue(
    QUEUES.TO_PROCESS,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  );
}

module.exports = {
  initQueueBridge,
  enqueueTask,
  registerActiveJob,
  unregisterActiveJob,
};
