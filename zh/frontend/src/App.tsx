import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import { AppStateProvider } from './store/AppState'
import Layout from './components/Layout'
import VideoTrack from './pages/VideoTrack'
import DataFit from './pages/DataFit'
import AIAssistant from './pages/AIAssistant'
import ExperimentNotes from './pages/ExperimentNotes'

export default function App() {
  return (
    <ThemeProvider>
      <AppStateProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<VideoTrack />} />
              <Route path="fit" element={<DataFit />} />
              <Route path="ai" element={<AIAssistant />} />
              <Route path="notes" element={<ExperimentNotes />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppStateProvider>
    </ThemeProvider>
  )
}
