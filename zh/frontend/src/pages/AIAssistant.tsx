import { useState, useRef, useEffect } from 'react'
import { Send, FileText, RefreshCw, Settings } from 'lucide-react'
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
        s.setChatMessages([...allMsgs, { role: 'assistant', content: '请求失败: ' + err.message }])
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
      { role: 'user', content: `请分析以下数据：\n${analyzeData}\n\n问题：${analyzeQuestion}` },
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
        s.setChatMessages(prev => { const cp = [...prev]; cp[cp.length - 1] = { role: 'assistant', content: '分析失败: ' + err.message }; return cp })
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
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">AI 实验助手</h3>
          <div className="flex gap-1">
            <button className="btn-ghost text-xs" onClick={() => setShowSettings(!showSettings)}><Settings className="h-3.5 w-3.5" />上下文</button>
            <button className="btn-ghost text-xs" onClick={() => s.setChatMessages([])}><RefreshCw className="h-3.5 w-3.5" />清空</button>
          </div>
        </div>
        {showSettings && (
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <label className="label-text">实验上下文（影响 AI 回答质量）</label>
            <textarea className="input-field h-28 font-mono text-xs" placeholder="输入实验原理、公式、步骤等上下文..." value={s.expContext} onChange={e => s.setExpContext(e.target.value)} />
            <button className="btn-primary text-xs mt-2" onClick={saveContext}>保存上下文</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
          {s.chatMessages.length === 0 && (
            <div className="text-center text-sm text-slate-400 mt-8"><p className="mb-2">您好，我是实验助手 AI</p><p className="text-xs">基于实验上下文提问，或使用右侧面板分析数据</p></div>
          )}
          {s.chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-primary-500 text-white rounded-br-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-bl-md'}`}>
                {msg.content ? <div className="whitespace-pre-wrap">{msg.content}</div> : (
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
            <input className="input-field flex-1" placeholder="输入实验相关问题..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} disabled={loading} />
            {loading ? <button className="btn-secondary px-3" onClick={handleStop}>停止</button> : <button className="btn-primary px-3" onClick={handleSend} disabled={!input.trim()}><Send className="h-4 w-4" /></button>}
          </div>
        </div>
      </div>

      <div className="w-[40%] card-glass flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700"><h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">数据分析</h3></div>
        <div className="flex-1 flex flex-col gap-3 p-4">
          <div><label className="label-text">粘贴数据（CSV/表格格式）</label><textarea className="input-field h-40 font-mono text-xs resize-none" placeholder="time_s,angle_deg,rpm_smooth..." value={analyzeData} onChange={e => setAnalyzeData(e.target.value)} /></div>
          <div><label className="label-text">分析问题</label><textarea className="input-field h-20 text-xs resize-none" placeholder="数据呈现什么趋势？建议使用何种拟合模型？" value={analyzeQuestion} onChange={e => setAnalyzeQuestion(e.target.value)} /></div>
          <button className="btn-primary w-full" onClick={handleAnalyze} disabled={analyzeLoading || !analyzeData.trim() || !analyzeQuestion.trim()}><FileText className="h-4 w-4" />{analyzeLoading ? '分析中...' : '请 AI 分析数据'}</button>
        </div>
      </div>
    </div>
  )
}
