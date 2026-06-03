import { useState, useEffect } from 'react'
import './AllTasks.css'

export default function AllTasks({ navigate, jobId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    setError(null)

    let url = `/jobs/${jobId}/tasks`
    if (statusFilter !== 'all') {
      url += `?status=${statusFilter}`
    }

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setTasks(data.tasks ?? [])
        setLoading(false)
      })
      .catch(err => { 
        setError(err.message)
        setLoading(false) 
      })
  }, [jobId, statusFilter])

  const okCount = tasks.filter(t => t.status === 'ok').length
  const failCount = tasks.filter(t => t.status === 'failed').length

  return (
    <div className="at-page">
      <header className="blue-header">
        <div className="blue-header-inner">
          <button className="back-btn" onClick={() => navigate('jobs')}>← Back</button>
          <div className="bl-title-block">
            <span className="bl-title">Tasks</span>
            <span className="bl-sub">Job ID: <code className="bl-sub-code">{jobId}</code></span>
          </div>
          {!loading && !error && (
            <div className="at-header-pills">
              <span className="status-badge ok">{okCount} ok</span>
              <span className="status-badge failed">{failCount} failed</span>
            </div>
          )}

          <div className="filter-dropdown-container">
              <label htmlFor="status-filter" className="sr-only">Filter by status</label>
              <select 
                id="status-filter"
                className="status-dropdown" 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Filter by status: All</option>
                <option value="ok">Filter by status: OK</option>
                <option value="failed">Filter by status: Failed</option>
              </select>
            </div>
        </div>
      </header>

      <main className="at-main">
        {loading && <div className="loading">Loading tasks…</div>}
        {error && <div className="error-msg">Failed to load: {error}</div>}
        {!loading && !error && tasks.length === 0 && (
          <div className="empty-msg">No tasks found for this job.</div>
        )}

        {!loading && !error && tasks.map((task, i) => (
          <div
            key={task.taskId}
            className={`at-card ${task.status}`}
            onClick={() => navigate('records', { jobId, taskId: task.taskId })}
          >
            <div className="at-index">{i + 1}</div>
            <div className="at-card-body">
              <div className="at-card-top">
                <span className={`status-badge ${task.status}`}>{task.status}</span>
                {task.status === 'ok'
                  ? <span className="at-record-count">{task.recordCount} records</span>
                  : task.error && <span className="at-error-msg">{task.error}</span>
                }
              </div>
              <div className="at-source"><span className="at-field-label">Source:</span> {task.source}</div>
              <div className="at-meta">
                <span>Task ID: <code className="at-task-id">{task.taskId}</code></span>
                <span className="meta-sep">·</span>
                <span>Created on: {new Date(task.createdAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="card-arrow">›</div>
          </div>
        ))}
      </main>
    </div>
  )
}
