const amqp = require("amqplib");

const QUEUES = {
  TO_PROCESS: "to_process",
  TO_PROCESS_RETRY: "to_process.retry",
  TO_PROCESS_DLQ: "to_process.dlq",
  PROCESSED: "processed",
};

const RETRY_DELAY_MS = 5000;

async function assertQueues(channel) {
  await channel.assertQueue(QUEUES.TO_PROCESS_DLQ, { durable: true });
  await channel.assertQueue(QUEUES.PROCESSED, { durable: true });
  await channel.assertQueue(QUEUES.TO_PROCESS_RETRY, {
    durable: true,
    arguments: {
      "x-message-ttl": RETRY_DELAY_MS,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": QUEUES.TO_PROCESS,
    },
  });
  await channel.assertQueue(QUEUES.TO_PROCESS, { durable: true });
}

async function connectRabbit(url, retries = 15) {
  const rabbitUrl = url || process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await amqp.connect(rabbitUrl);
      const channel = await connection.createChannel();
      await assertQueues(channel);
      return { connection, channel };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

module.exports = {
  QUEUES,
  RETRY_DELAY_MS,
  assertQueues,
  connectRabbit,
};
