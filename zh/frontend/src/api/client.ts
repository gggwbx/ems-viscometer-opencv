const API_BASE = ''

export async function fetchExperimentNotes(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/experiment/notes`)
  if (!res.ok) return ''
  const data = await res.json()
  return data.notes || ''
}

export async function fetchExperimentContext(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/experiment/context`)
  if (!res.ok) return ''
  const data = await res.json()
  return data.context || ''
}

export async function uploadVideo(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed')
  return res.json()
}

export async function setRoi(videoId: string, x: number, y: number, a: number, b: number) {
  const res = await fetch(`${API_BASE}/api/roi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: videoId, x, y, a, b }),
  })
  if (!res.ok) throw new Error('ROI setting failed')
  return res.json()
}

export async function startTracking(videoId: string) {
  const res = await fetch(`${API_BASE}/api/track/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: videoId }),
  })
  if (!res.ok) throw new Error((await res.json()).detail || 'Track start failed')
  return res.json()
}

export async function stopTracking(taskId: string) {
  await fetch(`${API_BASE}/api/track/stop/${taskId}`, { method: 'POST' })
}

export async function getTrackStatus(taskId: string) {
  const res = await fetch(`${API_BASE}/api/track/status/${taskId}`)
  if (!res.ok) throw new Error('Status check failed')
  return res.json()
}

export async function getTrackResult(taskId: string) {
  const res = await fetch(`${API_BASE}/api/track/result/${taskId}`)
  if (!res.ok) throw new Error('Result fetch failed')
  return res.json()
}

export function getTrackResultCsvUrl(taskId: string) {
  return `${API_BASE}/api/track/result/${taskId}/csv`
}

export async function doFit(data: {
  x: number[], y: number[], x_name: string, x_unit: string,
  y_name: string, y_unit: string, model: string
}) {
  const res = await fetch(`${API_BASE}/api/fit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error((await res.json()).detail || 'Fitting failed')
  return res.json()
}

export async function aiChat(
  messages: { role: string; content: string }[],
  experimentContext: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, experiment_context: experimentContext }),
    signal,
  })
  if (!res.ok) throw new Error('AI request failed')
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response stream')
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) throw new Error(parsed.error)
          if (parsed.content) onChunk(parsed.content)
        } catch { /* skip parse errors */ }
      }
    }
  }
}

export async function aiAnalyze(
  data: string, question: string, experimentContext: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  const res = await fetch(`${API_BASE}/api/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, question, experiment_context: experimentContext }),
    signal,
  })
  if (!res.ok) throw new Error('AI analyze request failed')
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response stream')
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) throw new Error(parsed.error)
          if (parsed.content) onChunk(parsed.content)
        } catch { /* skip */ }
      }
    }
  }
}
