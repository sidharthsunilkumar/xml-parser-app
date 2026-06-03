const { initDb } = require("./db_calls");
const { processTask, finalizeFailure, MAX_ATTEMPTS } = require("./processTask");
const { connectRabbit, QUEUES } = require("./lib/rabbitmq");
const fs = require("fs").promises;
const path = require("path");

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/xml_parser";
const PREFETCH = parseInt(process.env.PREFETCH || "5", 10);

let publishChannel = null;

const LOG_FILE_PATH = path.join(__dirname, "logs", "logs.json");

async function logToFile(payload) {
  try {
    // Ensure the logs directory exists
    await fs.mkdir(path.dirname(LOG_FILE_PATH), { recursive: true });

    let logs = [];
    try {
      const fileData = await fs.readFile(LOG_FILE_PATH, "utf8");
      logs = JSON.parse(fileData);
      if (!Array.isArray(logs)) logs = []; // Fallback if file gets corrupted
    } catch (err) {
      // File doesn't exist yet, start with empty array
    }

    // Append the new event
    logs.push({
      timestamp: new Date().toISOString(),
      ...payload
    });

    // Write back to file with pretty formatting
    await fs.writeFile(LOG_FILE_PATH, JSON.stringify(logs, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write to logs.json:", error.message);
  }
}

function publishProcessed(payload) {
  publishChannel.sendToQueue(
    QUEUES.PROCESSED,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  );
}

async function handleMessage(channel, msg) {
  let body;
  try {
    body = JSON.parse(msg.content.toString());
  } catch {
    channel.ack(msg);
    return;
  }

  const { jobId, taskId, url, index } = body;
  const attempt = body.attempt || 1;

  const result = await processTask({ jobId, taskId, url, index });

  if (result.ok) {
    await logToFile(result.payload); 
    publishProcessed(result.payload);
    channel.ack(msg);
    return;
  }

  if (result.retryable && attempt < MAX_ATTEMPTS) {
    channel.sendToQueue(
      QUEUES.TO_PROCESS_RETRY,
      Buffer.from(JSON.stringify({ jobId, taskId, url, index, attempt: attempt + 1 })),
      { persistent: true }
    );
    channel.ack(msg);
    return;
  }

  if (result.retryable) {
    channel.sendToQueue(
      QUEUES.TO_PROCESS_DLQ,
      Buffer.from(JSON.stringify({ jobId, taskId, url, index, attempt, error: result.error })),
      { persistent: true }
    );
    const final = await finalizeFailure(jobId, taskId, url, index, result.error);
    await logToFile(final.payload); 
    publishProcessed(final.payload);
  }

  channel.ack(msg);
}

async function start() {
  await initDb(MONGO_URL);

  const { connection, channel } = await connectRabbit();
  publishChannel = channel;
  await channel.prefetch(PREFETCH);

  console.log(`Processor listening on ${QUEUES.TO_PROCESS} (prefetch=${PREFETCH})`);

  // This block must live safely INSIDE start() where `channel` is defined
  channel.consume(QUEUES.TO_PROCESS, (msg) => {
    if (!msg) return;
    handleMessage(channel, msg).catch(async (err) => { 
      console.error("Task handler error:", err.message);
      const body = JSON.parse(msg.content.toString());
      const attempt = body.attempt || 1;
      if (attempt < MAX_ATTEMPTS) {
        channel.sendToQueue(
          QUEUES.TO_PROCESS_RETRY,
          Buffer.from(JSON.stringify({ ...body, attempt: attempt + 1 })),
          { persistent: true }
        );
      } else {
        try {
          const final = await finalizeFailure(body.jobId, body.taskId, body.url, body.index, err.message);
          await logToFile(final.payload); 
          publishProcessed(final.payload);
        } catch (e) {
          console.error("Failed to finalize after handler error:", e.message);
        }
      }
      channel.ack(msg);
    });
  });

  connection.on("close", () => {
    console.error("RabbitMQ connection closed");
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("Processor failed to start:", err.message);
  process.exit(1);
});