import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { fetchExperimentContext } from '../api/client'

interface ChatMessage { role: string; content: string }
interface FitResult { model: string; formula: string; formula_latex: string; params: { name: string; value: number; std_err?: number }[]; r_squared: number; rmse: number; fit_x: number[]; fit_y: number[] }
interface StatGroup { id: number; label: string; unit: string; data: string }
interface StatRow { label: string; unit: string; count: number; sum: number; min: number; max: number; range: number; mean: number; median: number; mode: number; variance_sample: number; variance_population: number; std_sample: number; std_population: number; skewness: number; kurtosis: number; q1: number; q2: number; q3: number; iqr: number; sum_of_squares: number; sem: number }

interface AppState {
  expContext: string
  setExpContext: (v: string) => void
  saveExpContext: (v: string) => void
  chatMessages: ChatMessage[]
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  contextLoaded: boolean

  driverRpm: string; setDriverRpm: (v: string) => void
  experimentGroupId: string; setExperimentGroupId: (v: string) => void

  fitRows: { x: string; y: string }[]; setFitRows: (v: { x: string; y: string }[]) => void
  fitXName: string; setFitXName: (v: string) => void
  fitXUnit: string; setFitXUnit: (v: string) => void
  fitYName: string; setFitYName: (v: string) => void
  fitYUnit: string; setFitYUnit: (v: string) => void
  fitModel: string; setFitModel: (v: string) => void
  fitCsvText: string; setFitCsvText: (v: string) => void
  fitResult: FitResult | null; setFitResult: (v: FitResult | null) => void

  notesContent: string; setNotesContent: (v: string) => void
  notesLoaded: boolean; setNotesLoaded: (v: boolean) => void
  notesEditing: boolean; setNotesEditing: (v: boolean) => void

  statCsvText: string; setStatCsvText: (v: string) => void
  statCsvUnit: string; setStatCsvUnit: (v: string) => void
  statGroups: StatGroup[]; setStatGroups: (v: StatGroup[]) => void
  statNextId: number; setStatNextId: (v: number) => void
  statResults: StatRow[]; setStatResults: (v: StatRow[]) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [expContext, setExpContext] = useState<string>(() => localStorage.getItem('experiment_context') || '')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try { const s = localStorage.getItem('chat_messages'); return s ? JSON.parse(s) : [] } catch { return [] }
  })
  const [contextLoaded, setContextLoaded] = useState(false)

  const [driverRpm, setDriverRpm] = useState('')
  const [experimentGroupId, setExperimentGroupId] = useState('')

  const [fitRows, setFitRows] = useState<{ x: string; y: string }[]>([])
  const [fitXName, setFitXName] = useState('转速比')
  const [fitXUnit, setFitXUnit] = useState('1')
  const [fitYName, setFitYName] = useState('粘度')
  const [fitYUnit, setFitYUnit] = useState('μPa·s')
  const [fitModel, setFitModel] = useState('linear')
  const [fitCsvText, setFitCsvText] = useState('')
  const [fitResult, setFitResult] = useState<FitResult | null>(null)

  const [notesContent, setNotesContent] = useState('')
  const [notesLoaded, setNotesLoaded] = useState(false)
  const [notesEditing, setNotesEditing] = useState(false)

  const [statCsvText, setStatCsvText] = useState('')
  const [statCsvUnit, setStatCsvUnit] = useState('')
  const [statGroups, setStatGroups] = useState<StatGroup[]>([{ id: 0, label: 'Data', unit: '', data: '' }])
  const [statNextId, setStatNextId] = useState(1)
  const [statResults, setStatResults] = useState<StatRow[]>([])

  const saveExpContext = useCallback((v: string) => {
    setExpContext(v)
    localStorage.setItem('experiment_context', v)
  }, [])

  const wrappedSetChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> = useCallback((v) => {
    setChatMessages(prev => {
      const next = typeof v === 'function' ? v(prev) : v
      try { localStorage.setItem('chat_messages', JSON.stringify(next.slice(-200))) } catch {}
      return next
    })
  }, [])

  if (!contextLoaded) {
    const local = localStorage.getItem('experiment_context')
    if (!local) {
      fetchExperimentContext().then(ctx => {
        if (ctx && !localStorage.getItem('experiment_context')) setExpContext(ctx)
        setContextLoaded(true)
      }).catch(() => setContextLoaded(true))
    } else {
      setContextLoaded(true)
    }
  }

  const value: AppState = {
    expContext, setExpContext, saveExpContext, chatMessages, setChatMessages: wrappedSetChatMessages, contextLoaded,
    driverRpm, setDriverRpm, experimentGroupId, setExperimentGroupId,
    fitRows, setFitRows, fitXName, setFitXName, fitXUnit, setFitXUnit,
    fitYName, setFitYName, fitYUnit, setFitYUnit, fitModel, setFitModel,
    fitCsvText, setFitCsvText, fitResult, setFitResult,
    notesContent, setNotesContent, notesLoaded, setNotesLoaded, notesEditing, setNotesEditing,
    statCsvText, setStatCsvText, statCsvUnit, setStatCsvUnit,
    statGroups, setStatGroups, statNextId, setStatNextId, statResults, setStatResults,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
