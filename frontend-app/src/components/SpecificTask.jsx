import { useState, useEffect } from 'react'
import './SpecificTask.css'

function buildPageNumbers(total, current) {
  const delta = 2
  const pages = new Set([1, total])
  for (let i = current - delta; i <= current + delta; i++) {
    if (i > 0 && i <= total) pages.add(i)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const result = []
  let prev = null
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) result.push('…')
    result.push(p)
    prev = p
  }
  return result
}

function formatField(value) {
  if (value == null || value === '') return '—'
  return String(value)
}

export default function SpecificTask({ navigate, jobId, taskId }) {
  const [task, setTask] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)

  const isFailed = task?.status === 'failed'

  useEffect(() => {
  setLoading(true)
  setError(null)
  setData(null)
  setTask(null)

  fetch(`/jobs/${jobId}/tasks/${taskId}`)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`)
      return r.json()
    })
    .then(taskData => {
      setTask(taskData)
      
      if (taskData.status === 'failed') {
        setLoading(false)
        return 'FAILED_BREAK' 
      }
      
      if (taskData.error) {
        throw new Error(taskData.error)
      }
      
      return fetch(`/jobs/${jobId}/tasks/${taskId}/records?page=${page}`)
    })
    .then(res => {
      if (!res || res === 'FAILED_BREAK') return null
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return res.json()
    })
    .then(d => {
      if (!d) return // Exited early from a failed task payload
      if (d.error) throw new Error(d.error)
      
      setData(d)
      setLoading(false)
    })
    .catch(err => { 
      setError(err.message)
      setLoading(false) 
    })
}, [jobId, taskId, page])

  function goPage(p) {
    if (!data || p < 1 || p > data.pages) return
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="st-page">
      <header className="blue-header">
        <div className="blue-header-inner">
          <button className="back-btn" onClick={() => navigate('tasks', { jobId })}>← Back</button>
          <div className="bl-title-block">
            <span className="bl-title">{isFailed ? 'Task failed' : 'Records'}</span>
            {data && !isFailed && (
              <span className="bl-sub">
                {data.total.toLocaleString()} records · page {data.page} of {data.pages}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="st-main">
        {loading && (
          <>
            <div className="st-info-bar">
              <span className="st-info-label">Task</span>
              <code className="st-info-code">{taskId}</code>
            </div>
            <div className="loading">Loading…</div>
          </>
        )}

        {error && !loading && (
          <>
            <div className="st-info-bar">
              <span className="st-info-label">Task</span>
              <code className="st-info-code">{taskId}</code>
            </div>
            <div className="error-msg">{error}</div>
          </>
        )}

        {/* Failed Panel display block setup */}
        {!loading && !error && isFailed && task && (
          <div className="st-failed-panel">
            <div className="st-failed-header">
              <span className="status-badge failed">failed</span>
            </div>
            <dl className="st-failed-details">
              <div className="st-failed-row">
                <dt>Task ID</dt>
                <dd><code className="st-failed-code">{task.taskId || taskId}</code></dd>
              </div>
              <div className="st-failed-row">
                <dt>Job ID</dt>
                <dd><code className="st-failed-code">{task.jobId || jobId}</code></dd>
              </div>
              <div className="st-failed-row">
                <dt>Source</dt>
                <dd>
                  {task.source ? (
                    <a href={task.source} target="_blank" rel="noopener noreferrer">{task.source}</a>
                  ) : '—'}
                </dd>
              </div>
              <div className="st-failed-row">
                <dt>Status</dt>
                <dd>{formatField(task.status)}</dd>
              </div>
              <div className="st-failed-row st-failed-row-error">
                <dt>Error</dt>
                <dd>{formatField(task.error)}</dd>
              </div>
              <div className="st-failed-row">
                <dt>Attempts</dt>
                <dd>{formatField(task.attempts)}</dd>
              </div>
              <div className="st-failed-row">
                <dt>Created at</dt>
                <dd>{task.createdAt ? new Date(task.createdAt).toLocaleString() : '—'}</dd>
              </div>
            </dl>
          </div>
        )}

        {!loading && !error && !isFailed && data && (
          <>
            <div className="st-info-bar">
              <div className="st-info-item">
                <span className="st-info-label">Task ID</span>
                <code className="st-info-code">{taskId}</code>
              </div>
              <div className="st-info-item">
                <span className="st-info-label">Job ID</span>
                <code className="st-info-code">{jobId}</code>
              </div>
              <div className="st-info-item">
                <span className="st-info-label">Total</span>
                <span className="st-info-val">{data.total.toLocaleString()} records</span>
              </div>
              <div className="st-info-item">
                <span className="st-info-label">Pages</span>
                <span className="st-info-val">{data.pages}</span>
              </div>
            </div>

            <div className="st-table-wrap">
              <table className="st-table">
                <thead>
                  <tr>
                    <th className="st-th-num">#</th>
                    <th>Title</th>
                    <th className="st-th-pub">Published</th>
                    <th className="st-th-author">Author</th>
                    <th>Summary</th>
                    <th className="st-th-link">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r, i) => (
                    <tr key={r.link || i}>
                      <td className="st-td-num">{(page - 1) * 20 + i + 1}</td>
                      <td className="st-td-title">{r.title ?? <span className="st-null">—</span>}</td>
                      <td className="st-td-pub">
                        {r.published
                          ? new Date(r.published).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : <span className="st-null">—</span>}
                      </td>
                      <td className="st-td-author">{r.author ?? <span className="st-null">—</span>}</td>
                      <td className="st-td-summary">
                        {r.summary
                          ? <span title={r.summary}>{r.summary.length > 120 ? r.summary.slice(0, 120) + '…' : r.summary}</span>
                          : <span className="st-null">—</span>}
                      </td>
                      <td className="st-td-link">
                        {r.link
                          ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="st-link-btn">↗</a>
                          : <span className="st-null">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pages > 1 && (
              <div className="st-pagination">
                <button className="pg-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>
                  ← Prev
                </button>
                <div className="pg-numbers">
                  {buildPageNumbers(data.pages, page).map((p, i) =>
                    p === '…'
                      ? <span key={`e-${i}`} className="pg-ellipsis">…</span>
                      : <button
                          key={p}
                          className={`pg-num${p === page ? ' active' : ''}`}
                          onClick={() => goPage(p)}
                        >{p}</button>
                  )}
                </div>
                <button className="pg-btn" onClick={() => goPage(page + 1)} disabled={page === data.pages}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}

        {!loading && !error && !isFailed && !data && (
          <div className="empty-msg">No records found for this task.</div>
        )}
      </main>
    </div>
  )
}