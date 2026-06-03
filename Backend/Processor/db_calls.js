const { MongoClient } = require("mongodb");

let collection = null;
let jobsCollection = null;
let tasksCollection = null;

async function initDb(uri) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  collection = db.collection("records");
  jobsCollection = db.collection("jobs");
  tasksCollection = db.collection("tasks");
  await collection.createIndex({ link: 1 }, { sparse: true });
  await jobsCollection.createIndex({ jobId: 1 }, { unique: true });
  await tasksCollection.createIndex({ jobId: 1, taskId: 1 }, { unique: true });
  console.log("Processor connected to MongoDB –", db.databaseName);
}

async function updateJobRecord(jobId, outcome) {
  if (!jobsCollection) throw new Error("DB not initialised — call initDb first");
  const inc = outcome === "passed" ? { passed: 1 } : { failed: 1 };
  const doc = await jobsCollection.findOneAndUpdate(
    { jobId },
    { $inc: inc },
    { returnDocument: "after" }
  );
  if (doc && doc.passed + doc.failed === doc.taskCount) {
    await jobsCollection.updateOne({ jobId }, { $set: { status: "completed", completedAt: new Date() } });
  }
}

async function persistRecords(newRecords) {
  if (!collection) throw new Error("DB not initialised — call initDb first");
  if (newRecords.length === 0) return;
  const ops = newRecords.map((r) => ({
    updateOne: {
      filter: { link: r.link ?? `${r.taskId}::${r.title}` },
      update: { $set: r },
      upsert: true,
    },
  }));
  await collection.bulkWrite(ops);
}

async function createTask(task) {
  if (!tasksCollection) throw new Error("DB not initialised — call initDb first");
  await tasksCollection.insertOne(task);
}

module.exports = {
  initDb,
  updateJobRecord,
  persistRecords,
  createTask,
};
