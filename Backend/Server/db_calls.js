const { MongoClient } = require("mongodb");

let collection = null;
let jobsCollection = null;
let tasksCollection = null;

/**
 * Connects to MongoDB and stores references to the `records` and `jobs` collections.
 * Creates a sparse index on `link` for records and a unique index on `jobId` for jobs.
 * Must be called once before any other db_calls functions are used.
 * @param {string} uri - The MongoDB connection URI (e.g. mongodb://mongo:27017/xml_parser).
 */
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
  console.log("Connected to MongoDB –", db.databaseName);
}

/**
 * Inserts a new job document into the `jobs` collection.
 * Initialises passed and failed counters to 0 and status to "in-progress".
 * If taskCount is 0 the job is immediately marked "completed".
 * @param {string} jobId - The UUID for this parse job.
 * @param {number} taskCount - Total number of URLs (tasks) in the job.
 */
async function createJob(jobId, taskCount) {
  if (!jobsCollection) throw new Error("DB not initialised — call initDb first");
  await jobsCollection.insertOne({
    jobId,
    taskCount,
    passed: 0,
    failed: 0,
    status: taskCount === 0 ? "completed" : "in-progress",
    createdAt: new Date(),
  });
}

/**
 * Increments the passed or failed counter on a job document.
 * When passed + failed equals taskCount the job status is set to "completed".
 * @param {string} jobId - The UUID of the job to update.
 * @param {"passed"|"failed"} outcome - Whether the task succeeded or failed.
 */
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

/**
 * Upserts an array of records into the `records` collection.
 * Each record is matched by its `link` field (or "source::title" if link is null).
 * Uses a bulkWrite with upsert so existing records are updated rather than duplicated.
 * @param {Array<object>} newRecords - The records to insert or update.
 */
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

/**
 * Returns the 10 most recently created jobs from the `jobs` collection.
 * Sorted by descending createdAt.
 * @returns {Promise<Array<object>>} The latest job documents.
 */
async function getLatestJobs() {
  if (!jobsCollection) throw new Error("DB not initialised — call initDb first");
  return jobsCollection.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(10).toArray();
}

/**
 * Finds a single job document by its jobId.
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
async function getJobById(jobId) {
  if (!jobsCollection) throw new Error("DB not initialised — call initDb first");
  return jobsCollection.findOne({ jobId }, { projection: { _id: 0 } });
}

/**
 * Inserts a task document into the `tasks` collection.
 * @param {object} task - The task to insert.
 */
async function createTask(task) {
  if (!tasksCollection) throw new Error("DB not initialised — call initDb first");
  await tasksCollection.insertOne(task);
}

/**
 * Returns all task documents for a given jobId.
 * @param {string} jobId
 * @returns {Promise<Array<object>>}
 */
async function getTasksByJob(jobId) {
  if (!tasksCollection) throw new Error("DB not initialised — call initDb first");
  return tasksCollection.find({ jobId }, { projection: { _id: 0 } }).toArray();
}

/**
 * Finds a single task document by taskId only (no jobId filter).
 * Used to distinguish "task not found" from "task belongs to a different job".
 * @param {string} taskId
 * @returns {Promise<object|null>}
 */
async function getTaskByTaskId(taskId) {
  if (!tasksCollection) throw new Error("DB not initialised — call initDb first");
  return tasksCollection.findOne({ taskId }, { projection: { _id: 0 } });
}

/**
 * Finds a single task document by jobId + taskId.
 * @param {string} jobId
 * @param {string} taskId
 * @returns {Promise<object|null>}
 */
async function getTaskByIds(jobId, taskId) {
  if (!tasksCollection) throw new Error("DB not initialised — call initDb first");
  return tasksCollection.findOne({ jobId, taskId }, { projection: { _id: 0 } });
}

/**
 * Returns a paginated slice of records matching a taskId.
 * Page size is fixed at 20.
 * @param {string} taskId
 * @param {number} page - 1-based page number.
 * @returns {Promise<{records: Array<object>, total: number, pages: number}>}
 */
async function getRecordsByTaskPaginated(taskId, page) {
  if (!collection) throw new Error("DB not initialised — call initDb first");
  const limit = 20;
  const skip = (page - 1) * limit;
  const [records, total] = await Promise.all([
    collection.find({ taskId }, { projection: { _id: 0 } }).skip(skip).limit(limit).toArray(),
    collection.countDocuments({ taskId }),
  ]);
  return { records, total, pages: Math.ceil(total / limit) };
}

module.exports = {
  initDb,
  createJob,
  updateJobRecord,
  persistRecords,
  getLatestJobs,
  getJobById,
  createTask,
  getTasksByJob,
  getTaskByTaskId,
  getTaskByIds,
  getRecordsByTaskPaginated,
  deleteAll,
};

/**
 * Deletes all documents from the records, jobs, and tasks collections.
 * @returns {Promise<{records: number, jobs: number, tasks: number}>} Counts of deleted documents.
 */
async function deleteAll() {
  if (!collection || !jobsCollection || !tasksCollection)
    throw new Error("DB not initialised — call initDb first");
  const [r, j, t] = await Promise.all([
    collection.deleteMany({}),
    jobsCollection.deleteMany({}),
    tasksCollection.deleteMany({}),
  ]);
  return { records: r.deletedCount, jobs: j.deletedCount, tasks: t.deletedCount };
}

