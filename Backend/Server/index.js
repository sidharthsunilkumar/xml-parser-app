const express = require("express");
const { randomUUID } = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  initDatabase,
  readUrlsFromCsv,
  runParseJob,
  getJobs,
  getJobSummary,
  getTaskList,
  getTaskInfo,
  getTaskRecords,
  clearAllData,
} = require("./utils");

const app = express();
const PORT = 1080;

const DATA_DIR = path.join(__dirname, "Data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DATA_DIR),
    filename: (_req, file, cb) => {
      const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._\- ]/g, "_");
      cb(null, safe);
    },
  }),
  fileFilter: (_req, file, cb) => {
    // Accepts .csv, .xlsx, or standard Excel/CSV MIME types
    const okExt = /\.(csv|xlsx)$/i.test(file.originalname);
    const okMime = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ].includes(file.mimetype);

    if (okExt || okMime) {
      cb(null, true);
    } else {
      cb(new Error("Only .csv and .xlsx files are allowed"), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/xml_parser";
const { initQueueBridge, unregisterActiveJob } = require("./queueBridge");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  console.log(`${req.method} ${req.path}`);
  next();
});

/**
 * GET /parse
 * Assigns a jobId, streams SSE events, and delegates all logic to runParseJob.
 */
app.get("/parse", async (req, res) => {
  const jobId = randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let urls;
  try {
    urls = await readUrlsFromCsv(req.query.file || null);
  } catch (err) {
    sendEvent("error", { jobId, message: "Failed to read CSV", detail: err.message });
    res.end();
    return;
  }

  res.on("close", () => unregisterActiveJob(jobId));

  await runParseJob(jobId, urls, sendEvent, () => res.end());
});

/**
 * POST /upload
 * Accepts a single .csv or .xlsx file and saves it to Backend/Data/.
 * Returns { filename } on success.
 */
app.post("/upload", (req, res) => {
  fileUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ filename: req.file.filename });
  });
});

/**
 * GET /jobs
 * Returns the 10 most recently created jobs.
 */
app.get("/jobs", async (req, res) => {
  try {
    const jobs = await getJobs();
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /jobs/:id
 * Returns a summary of a single job (totals, pending, elapsed time).
 */
app.get("/jobs/:id", async (req, res) => {
  try {
    const summary = await getJobSummary(req.params.id);
    if (!summary) return res.status(404).json({ error: "Job not found" });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /jobs/:id/tasks
 * Returns one object per source URL. Supports ?status=ok|failed filter.
 */
app.get("/jobs/:id/tasks", async (req, res) => {
  try {
    const tasks = await getTaskList(req.params.id, req.query.status);
    if (!tasks) return res.status(404).json({ error: "Job not found or has no records" });
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /jobs/:id/tasks/:task_id
 * Returns the record count for the given job + task pair.
 */
app.get("/jobs/:id/tasks/:task_id", async (req, res) => {
  try {
    const task = await getTaskInfo(req.params.id, req.params.task_id);
    if (task._error) return res.status(task._status).json({ error: task._error });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /jobs/:id/tasks/:task_id/records
 * Returns paginated records (20 per page). Use ?page=N to navigate.
 */
app.get("/jobs/:id/tasks/:task_id/records", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const result = await getTaskRecords(req.params.id, req.params.task_id, page);
    if (result._error) return res.status(result._status).json({ error: result._error });
    if (result.total === 0) return res.status(404).json({ error: "No records found for this task" });
    res.json({ jobId: req.params.id, taskId: req.params.task_id, page, pages: result.pages, total: result.total, records: result.records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /delete
 * Removes all documents from the records, jobs, and tasks collections.
 */
app.delete("/delete", async (req, res) => {
  try {
    const counts = await clearAllData();
    res.json({ message: "All data deleted", deleted: counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`SSE stream: http://localhost:${PORT}/parse`);
});

async function bootstrap() {
  try {
    await initDatabase(MONGO_URL);
    await initQueueBridge();
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

bootstrap();


