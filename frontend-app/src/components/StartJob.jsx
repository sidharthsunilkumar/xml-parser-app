import { useState, useRef } from 'react'
import './StartJob.css'

export default function StartJob({ navigate }) {
  const [job, setJob] = useState(null)
  const [tasks, setTasks] = useState([])
  const [running, setRunning] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const esRef = useRef(null)
  const fileInputRef = useRef(null)

  async function handleFileUpload(file) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Only .csv files are accepted')
      return
    }
    setUploading(true)
    setUploadError(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setUploadedFile(data.filename)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  function onDragOver(e) { e.preventDefault(); setDragging(true) }
  function onDragLeave(e) { e.preventDefault(); setDragging(false) }
  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }
  function onFileChange(e) {
    const file = e.target.files[0]
    if (file) handleFileUpload(file)
    e.target.value = ''
  }

  function startJob() {
    if (running || !uploadedFile) return
    setJob(null)
    setTasks([])
    setRunning(true)

    const es = new EventSource(`/parse?file=${encodeURIComponent(uploadedFile)}`)
    esRef.current = es

    es.addEventListener('start', (e) => {
      const data = JSON.parse(e.data)
      setJob({
        jobId: data.jobId,
        total: data.total,
        passed: 0,
        failed: 0,
        createdAt: data.createdAt,
        status: 'in-progress',
      })
    })

    es.addEventListener('feed', (e) => {
      const data = JSON.parse(e.data)
      setJob(prev => prev ? { ...prev, passed: prev.passed + 1 } : prev)
      setTasks(prev => [...prev, {
        taskId: data.taskId,
        source: data.url,
        status: 'ok',
        recordCount: data.count,
        index: data.index,
      }])
    })

    es.addEventListener('feed_error', (e) => {
      const data = JSON.parse(e.data)
      setJob(prev => prev ? { ...prev, failed: prev.failed + 1 } : prev)
      setTasks(prev => [...prev, {
        taskId: data.taskId,
        source: data.url,
        status: 'failed',
        error: data.message,
        index: data.index,
      }])
    })

    es.addEventListener('done', () => {
      setJob(prev => prev ? { ...prev, status: 'completed' } : prev)
      setRunning(false)
      es.close()
    })

    es.onerror = () => {
      setRunning(false)
      es.close()
    }
  }

  const pending = job ? job.total - job.passed - job.failed : 0

  return (
    <div className="sj-page">
      <header className="blue-header">
        <div className="blue-header-inner">
          <div className="bl-title-block">
            <span className="bl-title">XML Parser</span>
          </div>
          <div className="sj-nav-actions">
            <button className="sj-see-jobs-btn" onClick={() => navigate('jobs')}>See All Jobs</button>
          </div>
        </div>
      </header>

      <main className="sj-main">

        {/* ── Upload + Start section (hidden while running) ── */}
        {!running && (
          <div className="sj-upload-section">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />

            <div
              className={`sj-dropzone${dragging ? ' dragging' : ''}${uploadedFile ? ' uploaded' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current.click()}
            >
              {uploading ? (
                <div className="sj-dz-state">
                  <span className="sj-dz-icon">⏳</span>
                  <span className="sj-dz-title">Uploading…</span>
                </div>
              ) : uploadedFile ? (
                <div className="sj-dz-state">
                  <span className="sj-dz-icon">✅</span>
                  <span className="sj-dz-filename">{uploadedFile}</span>
                  <button
                    className="sj-dz-change"
                    onClick={(e) => {
                      e.stopPropagation()
                      setUploadedFile(null)
                      setUploadError(null)
                      fileInputRef.current.click()
                    }}
                  >
                    Change file
                  </button>
                </div>
              ) : (
                <div className="sj-dz-state">
                  <span className="sj-dz-icon">📂</span>
                  <span className="sj-dz-title">Drag &amp; drop a CSV file here</span>
                  <span className="sj-dz-sub">or click to browse</span>
                  <span className="sj-dz-hint">Accepts .csv files only</span>
                </div>
              )}
            </div>

            {uploadError && <div className="sj-upload-error">⚠ {uploadError}</div>}

            <button
              className="sj-start-btn"
              onClick={startJob}
              disabled={!uploadedFile}
            >
              Start Job
            </button>
          </div>
        )}

        {job && (
          <section className="sj-job-card">
            <div className="sj-job-id">
              <span className="sj-label">Job ID</span>
              <code>{job.jobId}</code>
            </div>

            <div className="sj-stats">
              <div className="sj-stat">
                <span className="sj-stat-value">{job.total}</span>
                <span className="sj-stat-label">Total</span>
              </div>
              <div className="sj-stat ok">
                <span className="sj-stat-value">{job.passed}</span>
                <span className="sj-stat-label">Passed</span>
              </div>
              <div className="sj-stat fail">
                <span className="sj-stat-value">{job.failed}</span>
                <span className="sj-stat-label">Failed</span>
              </div>
              <div className="sj-stat pending">
                <span className="sj-stat-value">{pending}</span>
                <span className="sj-stat-label">Pending</span>
              </div>
              <div className="sj-stat-divider" />
              <div className="sj-stat">
                <span className={`sj-badge ${job.status}`}>{job.status}</span>
                <span className="sj-stat-label">Status</span>
              </div>
              <div className="sj-stat">
                <span className="sj-stat-value sj-date">
                  {new Date(job.createdAt).toLocaleString()}
                </span>
                <span className="sj-stat-label">Created At</span>
              </div>
            </div>

            {job.total > 0 && (
              <div className="sj-progress">
                <div
                  className="sj-progress-bar ok"
                  style={{ width: `${(job.passed / job.total) * 100}%` }}
                />
                <div
                  className="sj-progress-bar fail"
                  style={{ width: `${(job.failed / job.total) * 100}%` }}
                />
              </div>
            )}
          </section>
        )}

        {tasks.length > 0 && (
          <section className="sj-tasks">
            <div className="sj-tasks-header">
              <h2>Tasks</h2>
              <span className="sj-tasks-count">{tasks.length} / {job?.total ?? '?'}</span>
            </div>
            <div className="sj-table-wrap">
              <table className="sj-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Source URL</th>
                    <th>Records / Error</th>
                    <th>Task ID</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.taskId} className={t.status}>
                      <td className="sj-col-num">{t.index}</td>
                      <td className="sj-col-status">
                        <span className={`sj-badge ${t.status}`}>{t.status}</span>
                      </td>
                      <td className="sj-col-source">{t.source}</td>
                      <td className="sj-col-result">
                        {t.status === 'ok'
                          ? <span className="sj-records">{t.recordCount} records</span>
                          : <span className="sj-error">{t.error}</span>
                        }
                      </td>
                      <td className="sj-col-id"><code>{t.taskId}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </main>
    </div>
  )
}
