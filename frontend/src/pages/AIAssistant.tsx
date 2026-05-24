import { useState, useRef, useEffect } from 'react'
import { Send, FileText, RefreshCw, Settings } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { aiChat, aiAnalyze } from '../api/client'
import { useAppState } from '../store/AppState'

export default function AIAssistant() {
  const s = useAppState()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [analyzeData, setAnalyzeData] = useState('')
  const [analyzeQuestion, setAnalyzeQuestion] = useState('')
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [s.chatMessages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user' as const, content: input }
    s.setChatMessages([...s.chatMessages, userMsg])
    setInput('')
    setLoading(true)

    const allMsgs = [...s.chatMessages, userMsg]
    let assistantContent = ''
    s.setChatMessages([...allMsgs, { role: 'assistant', content: '' }])

    abortRef.current = new AbortController()
    try {
      await aiChat(allMsgs, s.expContext, (chunk) => {
        assistantContent += chunk
        s.setChatMessages([...allMsgs, { role: 'assistant', content: assistantContent }])
      }, abortRef.current.signal)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        s.setChatMessages([...allMsgs, { role: 'assistant', content: 'Request failed: ' + err.message }])
      }
    }
    setLoading(false)
    abortRef.current = null
  }

  const handleStop = () => { abortRef.current?.abort(); setLoading(false) }

  const handleAnalyze = async () => {
    if (!analyzeData.trim() || !analyzeQuestion.trim()) return
    setAnalyzeLoading(true)
    let content = ''
    s.setChatMessages([...s.chatMessages,
      { role: 'user', content: `Please analyze the following data:\n${analyzeData}\n\nQuestion: ${analyzeQuestion}` },
      { role: 'assistant', content: '' },
    ])
    abortRef.current = new AbortController()
    try {
      await aiAnalyze(analyzeData, analyzeQuestion, s.expContext, (chunk) => {
        content += chunk
        s.setChatMessages(prev => { const cp = [...prev]; cp[cp.length - 1] = { role: 'assistant', content }; return cp })
      }, abortRef.current.signal)
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        s.setChatMessages(prev => { const cp = [...prev]; cp[cp.length - 1] = { role: 'assistant', content: 'Analysis failed: ' + err.message }; return cp })
      }
    }
    setAnalyzeLoading(false)
    abortRef.current = null
  }

  const saveContext = () => { s.saveExpContext(s.expContext); setShowSettings(false) }

  return (
    <div className="flex gap-4 h-[calc(100vh-6rem)]">
      <div className="w-[60%] card-glass flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">AI Experiment Assistant</h3>
          <div className="flex gap-1">
            <button className="btn-ghost text-xs" onClick={() => setShowSettings(!showSettings)}><Settings className="h-3.5 w-3.5" />Context</button>
            <button className="btn-ghost text-xs" onClick={() => s.setChatMessages([])}><RefreshCw className="h-3.5 w-3.5" />Clear</button>
          </div>
        </div>
        {showSettings && (
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <label className="label-text">Experiment Context (affects AI response quality)</label>
            <textarea className="input-field h-28 font-mono text-xs" placeholder="Enter experiment principles, formulas, procedures, etc..." value={s.expContext} onChange={e => s.setExpContext(e.target.value)} />
            <button className="btn-primary text-xs mt-2" onClick={saveContext}>Save Context</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
          {s.chatMessages.length === 0 && (
            <div className="text-center text-sm text-slate-400 mt-8"><p className="mb-2">Hello, I am your experiment assistant AI</p><p className="text-xs">Ask questions based on experiment context, or use the right panel to analyze data</p></div>
          )}
          {s.chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-primary-500 text-white rounded-br-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-bl-md'}`}>
                {msg.content ? (
                  msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800 prose-code:text-primary-600 [&_.katex]:text-sm [&_.katex-display]:my-2">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )
                ) : (
                  <div className="flex items-center gap-1 text-slate-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '0.15s' }} />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex gap-2">
            <input className="input-field flex-1" placeholder="Enter experiment-related questions..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} disabled={loading} />
            {loading ? <button className="btn-secondary px-3" onClick={handleStop}>Stop</button> : <button className="btn-primary px-3" onClick={handleSend} disabled={!input.trim()}><Send className="h-4 w-4" /></button>}
          </div>
        </div>
      </div>

      <div className="w-[40%] card-glass flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700"><h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Data Analysis</h3></div>
        <div className="flex-1 flex flex-col gap-3 p-4">
          <div><label className="label-text">Paste Data (CSV/Table format)</label><textarea className="input-field h-40 font-mono text-xs resize-none" placeholder="time_s,angle_deg,rpm_smooth..." value={analyzeData} onChange={e => setAnalyzeData(e.target.value)} /></div>
          <div><label className="label-text">Analysis Question</label><textarea className="input-field h-20 text-xs resize-none" placeholder="What trends does the data show? What fitting model do you recommend?" value={analyzeQuestion} onChange={e => setAnalyzeQuestion(e.target.value)} /></div>
          <button className="btn-primary w-full" onClick={handleAnalyze} disabled={analyzeLoading || !analyzeData.trim() || !analyzeQuestion.trim()}><FileText className="h-4 w-4" />{analyzeLoading ? 'Analyzing...' : 'Ask AI to Analyze Data'}</button>
        </div>
      </div>
    </div>
  )
}
