import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Save, Edit3 } from 'lucide-react'
import { fetchExperimentNotes } from '../api/client'
import { useAppState } from '../store/AppState'

export default function ExperimentNotes() {
  const s = useAppState()

  useEffect(() => {
    if (s.notesLoaded) return
    const local = localStorage.getItem('experiment_notes')
    if (local) { s.setNotesContent(local); s.setNotesLoaded(true); return }
    fetchExperimentNotes().then(notes => {
      if (!localStorage.getItem('experiment_notes')) s.setNotesContent(notes || '')
    }).catch(() => {}).finally(() => s.setNotesLoaded(true))
  }, [])

  const handleSave = () => {
    localStorage.setItem('experiment_notes', s.notesContent)
    s.setNotesEditing(false)
  }

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col">
      <div className="card-glass flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">实验说明</h2>
          <div className="flex gap-2">
            {s.notesEditing ? (
              <>
                <button className="btn-ghost text-xs" onClick={() => { s.setNotesEditing(false); s.setNotesContent(localStorage.getItem('experiment_notes') || s.notesContent) }}>取消</button>
                <button className="btn-primary text-xs" onClick={handleSave}><Save className="h-3.5 w-3.5" />保存</button>
              </>
            ) : (
              <button className="btn-secondary text-xs" onClick={() => s.setNotesEditing(true)}><Edit3 className="h-3.5 w-3.5" />编辑</button>
            )}
          </div>
        </div>

        {s.notesEditing ? (
          <textarea className="flex-1 w-full p-6 font-mono text-sm bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 outline-none resize-none border-0 focus:ring-0" value={s.notesContent} onChange={e => s.setNotesContent(e.target.value)} />
        ) : !s.notesLoaded ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">加载中...</div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="prose prose-slate dark:prose-invert max-w-none p-6 prose-headings:text-slate-800 dark:prose-headings:text-slate-100 prose-h2:border-b prose-h2:border-slate-200 dark:prose-h2:border-slate-700 prose-h2:pb-2 prose-a:text-primary-500 prose-code:text-primary-600 prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800 prose-img:rounded-lg prose-img:shadow-md [&_.katex]:text-base [&_.katex-display]:my-3">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{s.notesContent}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
