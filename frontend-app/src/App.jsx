import StartJob from './components/StartJob'
import SeeAllJobs from './components/SeeAllJobs'
import AllTasks from './components/AllTasks'
import SpecificTask from './components/SpecificTask'
import { useState } from 'react'
import './App.css'

function App() {
  const [route, setRoute] = useState({ page: 'start' })
  const navigate = (page, params = {}) => setRoute({ page, ...params })

  if (route.page === 'jobs')    return <SeeAllJobs navigate={navigate} />
  if (route.page === 'tasks')   return <AllTasks   navigate={navigate} jobId={route.jobId} />
  if (route.page === 'records') return <SpecificTask navigate={navigate} jobId={route.jobId} taskId={route.taskId} />
  return <StartJob navigate={navigate} />
}

export default App
