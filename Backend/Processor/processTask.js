const axios = require("axios");
const xml2js = require("xml2js");
const { persistRecords, createTask, updateJobRecord } = require("./db_calls");

async function fetchXml(url) {
  const response = await axios.get(url, {
    timeout: 10000,
    headers: { "User-Agent": "xml-parser-app/1.0" },
    responseType: "text",
  });
  return response.data;
}

function str(val) {
  if (!val) return null;
  if (typeof val === "string") return val.trim() || null;
  if (typeof val === "object") {
    return (val._ || val["#text"] || "").trim() || null;
  }
  return null;
}

function stripHtml(val) {
  const raw = str(val);
  if (!raw) return null;
  return (
    raw
      .replace(/<[^>]*>/g, " ")
      .replace(/<[^>]*$/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x[0-9a-fA-F]+;/gi, "")
      .replace(/&#\d+;/g, "")
      .replace(/&[a-z]+;/gi, "")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

function cleanAuthor(val) {
  const raw = str(val);
  if (!raw) return null;
  const match = raw.match(/\(([^)]+)\)/);
  return match ? match[1].trim() : raw;
}

async function parseXml(raw) {
  return xml2js.parseStringPromise(raw, {
    mergeAttrs: true,
    explicitArray: false,
    trim: true,
  });
}

function extractRecords(parsed, sourceUrl) {
  const records = [];

  const channel = parsed?.rss?.channel;
  if (channel) {
    const items = channel.item
      ? Array.isArray(channel.item)
        ? channel.item
        : [channel.item]
      : [];
    for (const item of items) {
      records.push({
        source: sourceUrl,
        title: str(item.title),
        link: str(item.link) || str(item.guid),
        published: str(item.pubDate) || str(item["dc:date"]) || null,
        author: cleanAuthor(item.author) || cleanAuthor(item["dc:creator"]) || null,
        summary: stripHtml(item.description) || stripHtml(item["content:encoded"]) || null,
      });
    }
    return records;
  }

  const feed = parsed?.feed;
  if (feed) {
    const entries = feed.entry
      ? Array.isArray(feed.entry)
        ? feed.entry
        : [feed.entry]
      : [];
    for (const entry of entries) {
      let link = null;
      if (entry.link) {
        const links = Array.isArray(entry.link) ? entry.link : [entry.link];
        const alt = links.find((l) => l.rel === "alternate" || !l.rel);
        link = alt ? alt.href || str(alt) : str(links[0]);
      }

      let author = null;
      if (entry.author) {
        const a = Array.isArray(entry.author) ? entry.author[0] : entry.author;
        author = cleanAuthor(a.name) || cleanAuthor(a);
      }

      records.push({
        source: sourceUrl,
        title: str(entry.title),
        link,
        published: str(entry.published) || str(entry.updated) || null,
        author,
        summary:
          stripHtml(entry.summary) ||
          stripHtml(entry.content) ||
          stripHtml(entry["media:group"]?.["media:description"]) ||
          null,
      });
    }
    return records;
  }

  return records;
}

const MAX_ATTEMPTS = 3;

/**
 * Processes one feed URL. Returns a result for the processed queue, or a retryable failure.
 * @returns {Promise<{ ok: true, payload: object } | { ok: false, retryable: boolean, error: string }>}
 */
async function processTask({ jobId, taskId, url, index }) {
  try {
    const raw = await fetchXml(url);

    let parsed;
    try {
      parsed = await parseXml(raw);
    } catch (parseErr) {
      const errMsg = `Malformed XML: ${parseErr.message}`;
      return finalizeFailure(jobId, taskId, url, index, errMsg);
    }

    const rawRecords = extractRecords(parsed, url);
    const records = rawRecords.map(({ title, link, published, author, summary }) => ({
      taskId,
      title,
      link,
      published,
      author,
      summary,
    }));
    await persistRecords(records);
    await createTask({
      taskId,
      jobId,
      source: url,
      status: "ok",
      recordCount: records.length,
      attempts: MAX_ATTEMPTS,
      createdAt: new Date(),
    });
    await updateJobRecord(jobId, "passed");

    return {
      ok: true,
      payload: {
        type: "feed",
        jobId,
        taskId,
        index,
        url,
        count: records.length,
        records,
        totalSaved: records.length,
      },
    };
  } catch (err) {
    return { ok: false, retryable: true, error: err.message };
  }
}

async function finalizeFailure(jobId, taskId, url, index, errMsg) {
  await createTask({
    taskId,
    jobId,
    source: url,
    status: "failed",
    error: errMsg,
    recordCount: 0,
    attempts: MAX_ATTEMPTS,
    createdAt: new Date(),
  });
  await updateJobRecord(jobId, "failed");
  return {
    ok: true,
    payload: {
      type: "feed_error",
      jobId,
      taskId,
      index,
      url,
      message: errMsg,
    },
  };
}

module.exports = {
  MAX_ATTEMPTS,
  processTask,
  finalizeFailure,
};
