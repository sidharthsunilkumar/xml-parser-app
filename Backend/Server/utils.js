const fs = require("fs");
const XLSX = require("xlsx");
const { parse } = require("csv-parse");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  initDb,
  createJob,
  getLatestJobs,
  getJobById,
  getTasksByJob,
  getTaskByTaskId,
  getRecordsByTaskPaginated,
  deleteAll,
} = require("./db_calls");
const { enqueueTask, registerActiveJob, unregisterActiveJob } = require("./queueBridge");

const DEFAULT_CSV = "XML List - Sheet1.csv";

/**
 * Reads the list of XML feed URLs from either a CSV or XLSX file.
 * @param {string|null} filename - Optional uploaded filename.
 * @returns {Promise<string[]>} Resolves with an array of URL strings.
 */
function readUrlsFromCsv(filename) {
  const safeName = filename ? path.basename(filename) : DEFAULT_CSV;
  const filePath = path.join(__dirname, "Data", safeName);

  return new Promise((resolve, reject) => {
    const urls = [];

    // Check if file is XLSX
    if (safeName.toLowerCase().endsWith(".xlsx")) {
      try {
        const workbook = XLSX.readFile(filePath);
        // Extract data from the very first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to raw array of arrays (rows)
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        for (const row of rows) {
          const url = row[0]?.toString().trim();
          if (url && url.startsWith("http")) {
            urls.push(url);
          }
        }
        return resolve(urls);
      } catch (err) {
        return reject(err);
      }
    }

    // Fallback/Default behavior: Process as Standard CSV stream
    fs.createReadStream(filePath)
      .pipe(parse({ trim: true }))
      .on("data", (row) => {
        const url = row[0];
        if (url && url.startsWith("http")) {
          urls.push(url);
        }
      })
      .on("end", () => resolve(urls))
      .on("error", reject);
  });
}
/**
 * Connects to MongoDB. Delegates to db_calls.initDb.
 * @param {string} uri - MongoDB connection URI.
 */
async function initDatabase(uri) {
  return initDb(uri);
}

/**
 * Orchestrates a parse job: creates the job, enqueues one task per URL, and streams
 * SSE events as results arrive on the processed queue.
 * @param {string} jobId - The UUID assigned to this parse job.
 * @param {string[]} urls - List of feed URLs to process.
 * @param {Function} sendEvent - SSE helper: (eventName, dataObject) => void.
 */
async function runParseJob(jobId, urls, sendEvent, onComplete) {
  sendEvent("start", { jobId, total: urls.length, createdAt: new Date() });
  await createJob(jobId, urls.length);

  registerActiveJob(jobId, { sendEvent, total: urls.length, onComplete });

  for (let i = 0; i < urls.length; i++) {
    const taskId = randomUUID();
    enqueueTask({ jobId, taskId, url: urls[i], index: i + 1 });
  }

  if (urls.length === 0) {
    sendEvent("done", { jobId, total: 0, totalSaved: 0 });
    unregisterActiveJob(jobId);
    if (onComplete) onComplete();
  }
}

/**
 * Returns the 10 most recently created jobs.
 * @returns {Promise<Array<object>>}
 */
async function getJobs() {
  return getLatestJobs();
}

/**
 * Builds a summary object for a single job.
 * Computes elapsed time as completedAt - createdAt (ms) if done, or now - createdAt if still running.
 * @param {string} jobId
 * @returns {Promise<object|null>} Summary object, or null if the job does not exist.
 */
async function getJobSummary(jobId) {
  const job = await getJobById(jobId);
  if (!job) return null;
  const elapsedMs = job.completedAt
    ? job.completedAt - job.createdAt
    : Date.now() - job.createdAt;
  return {
    "total-urls": job.taskCount,
    completed: job.passed,
    failed: job.failed,
    pending: job.taskCount - job.passed - job.failed,
    "elapsed time": elapsedMs,
  };
}

/**
 * Groups all records for a job by source URL and computes a per-task status.
 * A task is marked "failed" if any of its records contains a null value on any field.
 * @param {string} jobId
 * @param {string} [statusFilter] - Optional "ok" or "failed" filter.
 * @returns {Promise<Array<object>|null>} Task list, or null if no records found.
 */
async function getTaskList(jobId, statusFilter) {
  const tasks = await getTasksByJob(jobId);
  if (!tasks.length) return null;
  return statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks;
}

/**
 * Returns the total number of records stored for a given job + task ID pair.
 * @param {string} jobId
 * @param {string} taskId
 * @returns {Promise<number>}
 */
async function getTaskInfo(jobId, taskId) {
  const task = await getTaskByTaskId(taskId);
  if (!task) return { _error: "Task not found", _status: 404 };
  if (task.jobId !== jobId) return { _error: "Task does not belong to this job", _status: 400 };
  return task;
}

/**
 * Returns a paginated slice of records for a given job + task ID pair.
 * @param {string} jobId
 * @param {string} taskId
 * @param {number} page - 1-based page number.
 * @returns {Promise<{records: Array<object>, total: number, pages: number}>}
 */
async function getTaskRecords(jobId, taskId, page) {
  const task = await getTaskByTaskId(taskId);
  if (!task) return { _error: "Task not found", _status: 404 };
  if (task.jobId !== jobId) return { _error: "Task does not belong to this job", _status: 400 };
  return getRecordsByTaskPaginated(taskId, page);
}

async function clearAllData() {
  return deleteAll();
}

module.exports = {
  initDatabase,
  readUrlsFromCsv,
  runParseJob,
  getJobs,
  getJobSummary,
  getTaskList,
  getTaskInfo,
  getTaskRecords,
  clearAllData,
};
