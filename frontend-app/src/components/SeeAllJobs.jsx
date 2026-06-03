import { useState, useEffect } from 'react'
import './SeeAllJobs.css'

function formatElapsed(createdAt, completedAt) {
  if (!completedAt) return 'In progress'
  const ms = new Date(completedAt) - new Date(createdAt)
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export default function SeeAllJobs({ navigate }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/jobs')
      .then(r => r.json())
      .then(data => { setJobs(data.jobs ?? []); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  return (
    <div className="saj-page">
      <header className="blue-header">
        <div className="blue-header-inner">
          <button className="back-btn" onClick={() => navigate('start')}>← Back</button>
          <div className="bl-title-block">
            <span className="bl-title">Recent Jobs</span>
            {!loading && <span className="bl-sub">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>}
          </div>
        </div>
      </header>

      <main className="saj-main">
        {loading && <div className="loading">Loading jobs…</div>}
        {error && <div className="error-msg">Failed to load: {error}</div>}
        {!loading && !error && jobs.length === 0 && (
          <div className="empty-msg">No jobs yet. Run a parse job from the home page.</div>
        )}

        {!loading && !error && jobs.map(job => {
          const passedPct = job.taskCount ? (job.passed / job.taskCount) * 100 : 0
          const failedPct = job.taskCount ? (job.failed / job.taskCount) * 100 : 0
          return (
            <div key={job.jobId} className="saj-card" onClick={() => navigate('tasks', { jobId: job.jobId })}>
              <div className="saj-card-body">
                <div className="saj-card-top">
                  <span className={`status-badge ${job.status}`}>{job.status}</span>
                  <span className="saj-job-id-wrap">Job ID: <code className="saj-job-id">{job.jobId}</code></span>
                </div>

                <div className="saj-stats-row">
                  <div className="saj-stat">
                    <span className="saj-stat-num">{job.taskCount}</span>
                    <span className="saj-stat-lbl">Total</span>
                  </div>
                  <div className="saj-stat ok">
                    <span className="saj-stat-num">{job.passed}</span>
                    <span className="saj-stat-lbl">Passed</span>
                  </div>
                  <div className="saj-stat fail">
                    <span className="saj-stat-num">{job.failed}</span>
                    <span className="saj-stat-lbl">Failed</span>
                  </div>
                  <div className="saj-stat">
                    <span className="saj-stat-num">{job.taskCount - job.passed - job.failed}</span>
                    <span className="saj-stat-lbl">Pending</span>
                  </div>
                </div>

                <div className="saj-progress">
                  <div className="saj-bar ok" style={{ width: `${passedPct}%` }} />
                  <div className="saj-bar fail" style={{ width: `${failedPct}%` }} />
                </div>

                <div className="saj-meta">
                  <span>Created on: <strong>{new Date(job.createdAt).toLocaleString()}</strong></span>
                  <span className="meta-sep">·</span>
                  <span>Elapsed: <strong>{formatElapsed(job.createdAt, job.completedAt)}</strong></span>
                </div>
              </div>
              <div className="card-arrow">›</div>
            </div>
          )
        })}
      </main>
    </div>
  )
}
