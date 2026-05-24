import { useState, useRef, useEffect } from 'react'
import { Upload, Play, Square, Download, RotateCcw, Trash2, ArrowLeftRight } from 'lucide-react'
import ReactEChartsCore from 'echarts-for-react'
import { uploadVideo, setRoi, startTracking, getTrackStatus, getTrackResult, getTrackResultCsvUrl, deleteVideo } from '../api/client'
import { useAppState } from '../store/AppState'

export default function VideoTrack() {
  const appState = useAppState()
  const [videoId, setVideoId] = useState('')
  const [videoInfo, setVideoInfo] = useState<any>(null)
  const [firstFrameUrl, setFirstFrameUrl] = useState('')
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [roi, setRoiState] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [roiSaved, setRoiSaved] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [trackError, setTrackError] = useState('')
  const [taskId, setTaskId] = useState('')
  const [trackStatus, setTrackStatus] = useState<any>(null)
  const [rpmData, setRpmData] = useState<{ time: number[]; rpm: number[]; angle: number[] }>({ time: [], rpm: [], angle: [] })
  const [resultCsv, setResultCsv] = useState<any[]>([])
  const [resultSummary, setResultSummary] = useState<any>(null)
  const [rpmFit, setRpmFit] = useState<{ fitted_rpm: number[]; corrected_rpm: number[]; time_s: number[] } | null>(null)
  const [liveFrameUrl, setLiveFrameUrl] = useState('')
  const [importOmegaD, setImportOmegaD] = useState('')
  const [importX, setImportX] = useState('')
  const [importY, setImportY] = useState('')
  const [importToast, setImportToast] = useState('')
  const [swapLayout, setSwapLayout] = useState(false)

  const imgRef = useRef<HTMLImageElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const drawStart = useRef({ x: 0, y: 0 })
  const drawing = useRef(false)
  const pollRef = useRef<number>(0)

  useEffect(() => () => clearInterval(pollRef.current), [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | null = null
    if ('dataTransfer' in e) { e.preventDefault(); file = e.dataTransfer.files[0] }
    else file = e.target.files?.[0] || null
    if (!file) return
    setTrackError('')
    try {
      const info = await uploadVideo(file)
      setVideoId(info.video_id)
      setVideoInfo(info)
      setFirstFrameUrl(info.first_frame_url)
      setImgNatural({ w: 0, h: 0 })
      setRoiState(null)
      setRoiSaved(false)
      setTaskId('')
      setResultCsv([])
      setResultSummary(null)
      setRpmFit(null)
      setTrackStatus(null)
      setRpmData({ time: [], rpm: [], angle: [] })
    } catch (err: any) { setTrackError('上传失败: ' + (err.message || '')) }
  }

  const onImgLoad = () => {
    if (imgRef.current) setImgNatural({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
  }

  const toImg = (cx: number, cy: number) => {
    const img = imgRef.current
    if (!img || !imgNatural.w) return { x: 0, y: 0 }
    const r = img.getBoundingClientRect()
    return { x: Math.round((cx - r.left) * imgNatural.w / r.width), y: Math.round((cy - r.top) * imgNatural.h / r.height) }
  }

  const onDown = (e: React.MouseEvent) => {
    drawStart.current = toImg(e.clientX, e.clientY)
    drawing.current = true
    setRoiState(null)
    setRoiSaved(false)
  }

  const onMove = (e: React.MouseEvent) => {
    if (!drawing.current) return
    const p = toImg(e.clientX, e.clientY)
    setRoiState({
      x: Math.min(drawStart.current.x, p.x), y: Math.min(drawStart.current.y, p.y),
      w: Math.abs(p.x - drawStart.current.x), h: Math.abs(p.y - drawStart.current.y),
    })
  }

  const onUp = async () => {
    drawing.current = false
    if (!roi || roi.w < 10 || roi.h < 10 || !videoId) return
    const cx = roi.x + Math.floor(roi.w / 2)
    const cy = roi.y + Math.floor(roi.h / 2)
    const a = Math.floor(roi.w / 2)
    const b = Math.floor(roi.h / 2)
    try { await setRoi(videoId, cx, cy, a, b); setRoiSaved(true) } catch {}
  }

  // 返回叠加层的 CSS 位置（相对 overlayRef），null 表示不可见
  const overlayGeom = () => {
    if (!roi || !imgNatural.w) return null
    const img = imgRef.current; if (!img) return null
    const or = overlayRef.current; if (!or) return null
    const ri = img.getBoundingClientRect()
    const ro = or.getBoundingClientRect()
    const sx = ri.width / imgNatural.w, sy = ri.height / imgNatural.h
    return {
      left: roi.x * sx + (ri.left - ro.left),
      top: roi.y * sy + (ri.top - ro.top),
      rw: roi.w * sx, rh: roi.h * sy,
    }
  }

  const handleStartTrack = async () => {
    if (!videoId) return
    if (!roiSaved) { setTrackError('请先在首帧图像上拖拽框选磁盘区域'); return }
    setTrackError(''); setTracking(true); setTrackStatus(null)
    try {
      const result = await startTracking(videoId)
      setTaskId(result.task_id); setRpmData({ time: [], rpm: [], angle: [] })
      const tid = result.task_id
      // MJPEG 流式逐帧播放，浏览器原生支持
      setLiveFrameUrl(`/api/track/stream/${tid}`)
      // 启动状态轮询
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await getTrackStatus(tid)
          if (!st) return
          setTrackStatus(st)
          setRpmData(prev => ({ time: [...prev.time, st.elapsed_time], rpm: [...prev.rpm, st.current_rpm], angle: [...prev.angle, st.current_angle] }))
          if (st.status === 'completed' || st.status === 'error') {
            clearInterval(pollRef.current); setTracking(false); setLiveFrameUrl('')
            if (st.status === 'completed') {
              const res = await getTrackResult(tid)
              setResultCsv(res.csv_data || []); setResultSummary(res.summary)
              if (res.rpm_fit) setRpmFit(res.rpm_fit)
            }
            if (st.status === 'error') setTrackError(st.error || '跟踪出错')
          }
        } catch {}
      }, 500)
    } catch (err: any) { setTracking(false); setTrackError('启动失败: ' + (err.message || '')) }
  }

  const handleStop = () => { clearInterval(pollRef.current); setTracking(false); setLiveFrameUrl('') }

  const handleReupload = async () => {
    clearInterval(pollRef.current)
    if (videoId) {
      try { await deleteVideo(videoId) } catch {}
    }
    setVideoId(''); setVideoInfo(null); setFirstFrameUrl('')
    setImgNatural({ w: 0, h: 0 }); setRoiState(null); setRoiSaved(false)
    setTracking(false); setTrackError(''); setTaskId(''); setTrackStatus(null)
    setRpmData({ time: [], rpm: [], angle: [] })
    setResultCsv([]); setResultSummary(null); setRpmFit(null)
    setLiveFrameUrl(''); setImportOmegaD(''); setImportX(''); setImportY('')
  }

  const handleClearTracking = () => {
    clearInterval(pollRef.current)
    setTracking(false); setTrackError(''); setTaskId(''); setTrackStatus(null)
    setRpmData({ time: [], rpm: [], angle: [] })
    setResultCsv([]); setResultSummary(null); setRpmFit(null)
    setLiveFrameUrl(''); setImportOmegaD(''); setImportX(''); setImportY('')
  }

  useEffect(() => {
    const om = parseFloat(importOmegaD)
    if (!isNaN(om) && om > 0) {
      setImportX(om.toFixed(2))
      const driver = parseFloat(appState.driverRpm)
      if (!isNaN(driver)) setImportY((driver - om).toFixed(2))
      else setImportY('')
    } else {
      setImportX(''); setImportY('')
    }
  }, [importOmegaD, appState.driverRpm])

  useEffect(() => {
    if (resultSummary?.avg_rpm) setImportOmegaD(String(resultSummary.avg_rpm))
  }, [resultSummary])

  const handleImportFit = () => {
    const driver = parseFloat(appState.driverRpm)
    const x = parseFloat(importX)
    const y = parseFloat(importY)
    if (isNaN(driver) || driver <= 0) { setImportToast('请先输入有效的驱动磁铁转速'); setTimeout(() => setImportToast(''), 3000); return }
    if (isNaN(x) || isNaN(y)) { setImportToast('拟合数据无效'); setTimeout(() => setImportToast(''), 3000); return }
    appState.setFitRows([...appState.fitRows, { x: String(x), y: String(y) }])
    appState.setFitXName('拟合转速'); appState.setFitXUnit('RPM')
    appState.setFitYName('ΩM - ΩD'); appState.setFitYUnit('RPM')
    appState.setFitResult(null)
    setImportToast(`已导入: 实验组${appState.experimentGroupId || '?'}, ΩD=${x}, ΩM-ΩD=${y}`)
    setTimeout(() => setImportToast(''), 3000)
  }

  const rpmOption = {
    backgroundColor: 'transparent', tooltip: { trigger: 'axis' as const },
    legend: { data: ['RPM(原始)', 'RPM(拟合)', 'RPM(修正)', 'Angle'], textStyle: { color: '#94a3b8' } },
    grid: { left: 50, right: 50, top: 40, bottom: 30 },
    xAxis: { type: 'value' as const, name: 'Time (s)' },
    yAxis: [{ type: 'value' as const, name: 'RPM' }, { type: 'value' as const, name: 'Angle (°)' }],
    series: [
      { name: 'RPM(原始)', type: 'line', data: rpmData.time.map((t, i) => [t, rpmData.rpm[i]]), smooth: false, lineStyle: { color: '#3b82f6', width: 1, opacity: 0.4 }, itemStyle: { color: '#3b82f6' }, symbol: 'none' },
      ...(rpmFit ? [
        { name: 'RPM(拟合)', type: 'line', data: rpmFit.time_s.map((t, i) => [t, rpmFit.fitted_rpm[i]]), smooth: true, lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' }, symbol: 'none' },
        { name: 'RPM(修正)', type: 'line', data: rpmFit.time_s.map((t, i) => [t, rpmFit.corrected_rpm[i]]), smooth: true, lineStyle: { color: '#10b981', width: 1.5 }, itemStyle: { color: '#10b981' }, symbol: 'none' },
      ] : []),
      { name: 'Angle', type: 'line', yAxisIndex: 1, data: rpmData.time.map((t, i) => [t, rpmData.angle[i]]), smooth: true, lineStyle: { color: '#fbbf24' }, itemStyle: { color: '#fbbf24' } },
    ],
  }

  const cx = roi ? roi.x + Math.floor(roi.w / 2) : 0
  const cy = roi ? roi.y + Math.floor(roi.h / 2) : 0
  const a = roi ? Math.floor(roi.w / 2) : 0
  const b = roi ? Math.floor(roi.h / 2) : 0

  const g = overlayGeom()

  return (
    <div className="flex gap-4 h-[calc(100vh-6rem)]">
      {/* ===== 左栏 35% ===== */}
      <div className="w-[35%] flex flex-col gap-3 min-w-0">
        {/* 视频上传卡片 */}
        <div className="card-glass p-4 flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">视频上传</h3>
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-6 cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 transition-colors bg-slate-50 dark:bg-slate-800/50" onDragOver={e => e.preventDefault()} onDrop={handleUpload}>
            <Upload className="h-7 w-7 text-slate-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">{videoInfo ? videoInfo.filename : '拖放或点击上传视频'}</span>
            <input type="file" accept="video/*" onChange={handleUpload} className="hidden" />
          </label>
          {videoInfo && <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-500 dark:text-slate-400"><span>帧率: {videoInfo.fps} FPS</span><span>时长: {videoInfo.duration}s</span><span>总帧数: {videoInfo.total_frames}</span></div>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="label-text">驱动磁铁转速 ΩM</label>
              <div className="flex items-center gap-1">
                <input type="number" className="input-field flex-1" placeholder="输入 RPM" value={appState.driverRpm} onChange={e => appState.setDriverRpm(e.target.value)} />
                <span className="text-xs text-slate-500">RPM</span>
              </div>
            </div>
            <div>
              <label className="label-text">实验组编号</label>
              <input type="text" className="input-field" placeholder="如: 第1组" value={appState.experimentGroupId} onChange={e => appState.setExperimentGroupId(e.target.value)} />
            </div>
          </div>
        </div>

        {swapLayout ? (
          /* ROI 框选卡片（swapLayout=true 时在左栏） */
          <div className="card-glass p-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                ROI 框选 {roiSaved && <span className="text-green-500 text-xs font-normal">已保存</span>}
              </h3>
              <button className="btn-ghost text-xs" onClick={() => setSwapLayout(false)} title="交换位置"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
            </div>
            {firstFrameUrl ? (
              <div className="relative flex-1 overflow-hidden rounded-lg bg-slate-800 min-h-[200px] select-none">
                <img ref={imgRef} src={liveFrameUrl || firstFrameUrl} alt={liveFrameUrl ? '跟踪' : '首帧'} className="w-full h-full" onLoad={liveFrameUrl ? undefined : onImgLoad} />
                <div ref={overlayRef} className="absolute inset-0 cursor-crosshair"
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => drawing.current = false}>
                  {!tracking && g && (
                    <>
                      <div className="absolute border-2 border-blue-400 border-dashed" style={{ left: g.left, top: g.top, width: g.rw, height: g.rh }} />
                      <div className="absolute w-2 h-2 bg-red-500 rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: g.left + g.rw / 2, top: g.top + g.rh / 2 }} />
                      <div className="absolute border-2 border-yellow-400 rounded-[50%]" style={{ left: g.left, top: g.top, width: g.rw, height: g.rh }} />
                      <div className="absolute text-[10px] text-yellow-400 bg-slate-900/80 px-1 rounded whitespace-nowrap" style={{ left: g.left, top: g.top - 16 }}>
                        Center:({cx},{cy}) a={a} b={b}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : <div className="flex-1 flex items-center justify-center text-xs text-slate-400">请先上传视频</div>}
            <div className="mt-3 flex gap-2">
              {videoId && <button className="btn-secondary" onClick={handleReupload} disabled={tracking}><RotateCcw className="h-4 w-4" />重新上传</button>}
              <button className="btn-primary flex-1" disabled={!videoId || tracking} onClick={handleStartTrack}><Play className="h-4 w-4" />{tracking ? '跟踪中...' : '开始跟踪'}</button>
              {tracking && <button className="btn-secondary" onClick={handleStop}><Square className="h-4 w-4" /></button>}
              {(resultCsv.length > 0 || tracking) && !tracking && <button className="btn-secondary" onClick={handleClearTracking}><Trash2 className="h-4 w-4" />清空</button>}
            </div>
            {trackError && <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">{trackError}</div>}
            {trackStatus && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${trackStatus.progress}%` }} /></div>
                <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{trackStatus.current_frame}/{trackStatus.total_frames} 帧</span><span>RPM: {trackStatus.current_rpm.toFixed(1)}</span></div>
              </div>
            )}
          </div>
        ) : (
          /* 转速-时间曲线卡片（swapLayout=false 时在左栏） */
          <div className="card-glass p-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">转速-时间曲线</h3>
              <div className="flex items-center gap-1">
                <button className="btn-ghost text-xs" onClick={() => setSwapLayout(true)} title="交换位置"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
                {resultCsv.length > 0 && <a href={getTrackResultCsvUrl(taskId)} download className="btn-ghost text-xs"><Download className="h-3.5 w-3.5" />下载 CSV</a>}
              </div>
            </div>
            <div className="flex-1 min-h-0"><ReactEChartsCore option={rpmOption} style={{ height: '100%', width: '100%' }} notMerge /></div>
          </div>
        )}
      </div>

      {/* ===== 右栏 65% ===== */}
      <div className="w-[65%] flex flex-col gap-3 min-w-0">
        {swapLayout ? (
          /* 转速-时间曲线卡片（swapLayout=true 时在右栏） */
          <div className="card-glass p-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">转速-时间曲线</h3>
              <div className="flex items-center gap-1">
                <button className="btn-ghost text-xs" onClick={() => setSwapLayout(false)} title="交换位置"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
                {resultCsv.length > 0 && <a href={getTrackResultCsvUrl(taskId)} download className="btn-ghost text-xs"><Download className="h-3.5 w-3.5" />下载 CSV</a>}
              </div>
            </div>
            <div className="flex-1 min-h-0"><ReactEChartsCore option={rpmOption} style={{ height: '100%', width: '100%' }} notMerge /></div>
          </div>
        ) : (
          /* ROI 框选卡片（swapLayout=false 时在右栏） */
          <div className="card-glass p-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                ROI 框选 {roiSaved && <span className="text-green-500 text-xs font-normal">已保存</span>}
              </h3>
              <button className="btn-ghost text-xs" onClick={() => setSwapLayout(true)} title="交换位置"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
            </div>
            {firstFrameUrl ? (
              <div className="relative flex-1 overflow-hidden rounded-lg bg-slate-800 min-h-[200px] select-none">
                <img ref={imgRef} src={liveFrameUrl || firstFrameUrl} alt={liveFrameUrl ? '跟踪' : '首帧'} className="w-full h-full" onLoad={liveFrameUrl ? undefined : onImgLoad} />
                <div ref={overlayRef} className="absolute inset-0 cursor-crosshair"
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => drawing.current = false}>
                  {!tracking && g && (
                    <>
                      <div className="absolute border-2 border-blue-400 border-dashed" style={{ left: g.left, top: g.top, width: g.rw, height: g.rh }} />
                      <div className="absolute w-2 h-2 bg-red-500 rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: g.left + g.rw / 2, top: g.top + g.rh / 2 }} />
                      <div className="absolute border-2 border-yellow-400 rounded-[50%]" style={{ left: g.left, top: g.top, width: g.rw, height: g.rh }} />
                      <div className="absolute text-[10px] text-yellow-400 bg-slate-900/80 px-1 rounded whitespace-nowrap" style={{ left: g.left, top: g.top - 16 }}>
                        Center:({cx},{cy}) a={a} b={b}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : <div className="flex-1 flex items-center justify-center text-xs text-slate-400">请先上传视频</div>}
            <div className="mt-3 flex gap-2">
              {videoId && <button className="btn-secondary" onClick={handleReupload} disabled={tracking}><RotateCcw className="h-4 w-4" />重新上传</button>}
              <button className="btn-primary flex-1" disabled={!videoId || tracking} onClick={handleStartTrack}><Play className="h-4 w-4" />{tracking ? '跟踪中...' : '开始跟踪'}</button>
              {tracking && <button className="btn-secondary" onClick={handleStop}><Square className="h-4 w-4" /></button>}
              {(resultCsv.length > 0 || tracking) && !tracking && <button className="btn-secondary" onClick={handleClearTracking}><Trash2 className="h-4 w-4" />清空</button>}
            </div>
            {trackError && <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">{trackError}</div>}
            {trackStatus && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${trackStatus.progress}%` }} /></div>
                <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{trackStatus.current_frame}/{trackStatus.total_frames} 帧</span><span>RPM: {trackStatus.current_rpm.toFixed(1)}</span></div>
              </div>
            )}
          </div>
        )}

        {/* 数据表 + 导入区（左右拆分，始终在底部） */}
        <div className="flex gap-3 flex-shrink-0 max-h-[40%]">
          {/* 左侧：数据表 */}
          <div className="card-glass p-4 flex-[3] overflow-y-auto scrollbar-thin min-w-0">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">数据表</h3>
            {resultSummary && (
              <div className="mb-2 grid grid-cols-4 gap-1.5 text-xs">
                <div className="rounded bg-slate-100 dark:bg-slate-800 p-1.5 text-center"><span className="text-slate-500">平均 RPM</span><div className="font-mono font-semibold text-primary-600">{resultSummary.avg_rpm}</div></div>
                <div className="rounded bg-slate-100 dark:bg-slate-800 p-1.5 text-center"><span className="text-slate-500">最大 RPM</span><div className="font-mono font-semibold text-tech-green">{resultSummary.max_rpm}</div></div>
                <div className="rounded bg-slate-100 dark:bg-slate-800 p-1.5 text-center"><span className="text-slate-500">最小 RPM</span><div className="font-mono font-semibold text-tech-amber">{resultSummary.min_rpm}</div></div>
                <div className="rounded bg-slate-100 dark:bg-slate-800 p-1.5 text-center"><span className="text-slate-500">标准差</span><div className="font-mono font-semibold text-slate-600">{resultSummary.std_rpm}</div></div>
              </div>
            )}
            {resultCsv.length > 0 ? (
              <table className="w-full text-xs font-mono"><thead><tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700"><th className="py-1 pr-2">帧</th><th className="py-1 pr-2">时间(s)</th><th className="py-1 pr-2">角度(°)</th><th className="py-1">RPM</th></tr></thead>
                <tbody>{resultCsv.slice(0, 50).map((r: any, i: number) => (<tr key={i} className="border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400"><td className="py-0.5 pr-2">{r.frame}</td><td className="py-0.5 pr-2">{r.time_s}</td><td className="py-0.5 pr-2">{r.angle_deg}</td><td className="py-0.5">{r.rpm_smooth}</td></tr>))}</tbody></table>
            ) : <div className="text-xs text-slate-400 text-center py-4">暂无数据</div>}
          </div>

          {/* 右侧：导入确认窗口 */}
          <div className="card-glass p-4 flex-[2] flex flex-col min-w-0">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">导入拟合数据</h3>
            {resultSummary ? (
              <>
                <div className="space-y-1.5 text-xs mb-3">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">驱动磁铁转速 ΩM:</span>
                    <span className="font-mono font-semibold text-primary-600">{appState.driverRpm || '—'} RPM</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">实验组:</span>
                    <span className="font-mono font-semibold text-primary-600">{appState.experimentGroupId || '—'}</span>
                  </div>
                </div>
                <div className="space-y-2 mb-3">
                  <div>
                    <label className="label-text">X (拟合转速 ΩD)</label>
                    <input type="number" className="input-field" value={importX} onChange={e => {
                      setImportX(e.target.value)
                      const xv = parseFloat(e.target.value)
                      const driver = parseFloat(appState.driverRpm)
                      if (!isNaN(xv) && !isNaN(driver)) setImportY((driver - xv).toFixed(2))
                    }} />
                  </div>
                  <div>
                    <label className="label-text">Y (ΩM - ΩD)</label>
                    <input type="number" className="input-field" value={importY} onChange={e => setImportY(e.target.value)} />
                  </div>
                </div>
                <button className="btn-primary w-full mt-auto" onClick={handleImportFit}>导入到数据拟合</button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">跟踪完成后可导入数据</div>
            )}
          </div>
        </div>
      </div>

      {importToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-green-50 dark:bg-green-950/80 border border-green-300 dark:border-green-700 px-4 py-2 text-sm text-green-700 dark:text-green-300 shadow-lg">
          {importToast}
        </div>
      )}
    </div>
  )
}
