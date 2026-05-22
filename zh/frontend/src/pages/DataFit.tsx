import { useEffect, useRef } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import { Calculator, Download, Upload, Trash2 } from 'lucide-react'
import { doFit } from '../api/client'
import { useAppState } from '../store/AppState'
import katex from 'katex'

const MODELS = [
  { value: 'linear', label: 'y = ax + b' },
  { value: 'linear_zero', label: 'y = kx' },
  { value: 'quadratic', label: 'y = ax² + bx + c' },
  { value: 'exponential', label: 'y = a·exp(bx)' },
  { value: 'logarithmic', label: 'y = a·ln(x) + b' },
  { value: 'reciprocal', label: 'y = k/x + b' },
]

export default function DataFit() {
  const s = useAppState()
  const formulaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (s.fitResult?.formula_latex && formulaRef.current) {
      try { katex.render(s.fitResult.formula_latex, formulaRef.current, { throwOnError: false }) } catch {}
    }
  }, [s.fitResult])

  const addRow = () => s.setFitRows([...s.fitRows, { x: '', y: '' }])
  const removeRow = (i: number) => { if (s.fitRows.length <= 2) return; s.setFitRows(s.fitRows.filter((_, idx) => idx !== i)) }
  const updateRow = (i: number, field: 'x' | 'y', value: string) => {
    const copy = [...s.fitRows]; copy[i][field] = value; s.setFitRows(copy)
  }

  const parseCsv = () => {
    const lines = s.fitCsvText.trim().split('\n')
    const parsed: { x: string; y: string }[] = []
    for (const line of lines) {
      const parts = line.split(/[,;\t]/).map(p => p.trim())
      if (parts.length >= 2 && parts[0] && parts[1]) parsed.push({ x: parts[0], y: parts[1] })
    }
    if (parsed.length > 0) s.setFitRows(parsed)
  }

  const handleFit = async () => {
    const xs: number[] = [], ys: number[] = []
    for (const row of s.fitRows) { const x = parseFloat(row.x), y = parseFloat(row.y); if (!isNaN(x) && !isNaN(y)) { xs.push(x); ys.push(y) } }
    if (xs.length < 2) return
    try {
      const result = await doFit({ x: xs, y: ys, x_name: s.fitXName, x_unit: s.fitXUnit, y_name: s.fitYName, y_unit: s.fitYUnit, model: s.fitModel })
      s.setFitResult(result)
    } catch {}
  }

  const chartOption = {
    backgroundColor: 'transparent', tooltip: { trigger: 'axis' as const },
    legend: { data: ['数据点', '拟合曲线'], textStyle: { color: '#94a3b8' } },
    grid: { left: 60, right: 30, top: 40, bottom: 40 },
    xAxis: { type: 'value' as const, name: `${s.fitXName}${s.fitXUnit ? ` (${s.fitXUnit})` : ''}`, nameTextStyle: { color: '#94a3b8' } },
    yAxis: { type: 'value' as const, name: `${s.fitYName}${s.fitYUnit ? ` (${s.fitYUnit})` : ''}`, nameTextStyle: { color: '#94a3b8' } },
    series: [
      { name: '数据点', type: 'scatter', data: s.fitRows.filter(r => !isNaN(parseFloat(r.x)) && !isNaN(parseFloat(r.y))).map(r => [parseFloat(r.x), parseFloat(r.y)]), symbolSize: 8, itemStyle: { color: '#3b82f6' } },
      ...(s.fitResult ? [{ name: '拟合曲线', type: 'line', data: s.fitResult.fit_x.map((x: number, i: number) => [x, s.fitResult!.fit_y[i]]), smooth: true, lineStyle: { color: '#ef4444', width: 2 }, itemStyle: { color: '#ef4444' }, symbol: 'none' as const }] : []),
    ],
  }

  const exportReport = () => {
    if (!s.fitResult) return
    const blob = new Blob([JSON.stringify({ x_name: s.fitXName, x_unit: s.fitXUnit, y_name: s.fitYName, y_unit: s.fitYUnit, model: s.fitResult.model, formula: s.fitResult.formula, params: s.fitResult.params, r_squared: s.fitResult.r_squared, rmse: s.fitResult.rmse }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fit_report.json'; a.click()
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-6rem)]">
      <div className="w-[35%] flex flex-col gap-3 min-w-0">
        <div className="card-glass p-4 flex-1 flex flex-col min-h-0">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">数据输入</h3>
          <div className="flex gap-2 mb-3">
            <textarea className="input-field flex-1 h-20 text-xs font-mono resize-none" placeholder="粘贴 CSV 数据..." value={s.fitCsvText} onChange={e => s.setFitCsvText(e.target.value)} />
            <button className="btn-secondary text-xs h-fit" onClick={parseCsv}><Upload className="h-3.5 w-3.5" />导入</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div><label className="label-text">X 轴名称</label><input className="input-field" value={s.fitXName} onChange={e => s.setFitXName(e.target.value)} /></div>
            <div><label className="label-text">X 轴单位</label><input className="input-field" value={s.fitXUnit} onChange={e => s.setFitXUnit(e.target.value)} /></div>
            <div><label className="label-text">Y 轴名称</label><input className="input-field" value={s.fitYName} onChange={e => s.setFitYName(e.target.value)} /></div>
            <div><label className="label-text">Y 轴单位</label><input className="input-field" value={s.fitYUnit} onChange={e => s.setFitYUnit(e.target.value)} /></div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
                <th className="py-1 pr-2">#</th><th className="py-1 pr-2">X</th><th className="py-1 pr-2">Y</th><th className="py-1 w-8"></th>
              </tr></thead>
              <tbody>{s.fitRows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-0.5 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-0.5 pr-2"><input className="w-full bg-transparent text-slate-700 dark:text-slate-300 outline-none font-mono" value={row.x} onChange={e => updateRow(i, 'x', e.target.value)} /></td>
                  <td className="py-0.5 pr-2"><input className="w-full bg-transparent text-slate-700 dark:text-slate-300 outline-none font-mono" value={row.y} onChange={e => updateRow(i, 'y', e.target.value)} /></td>
                  <td className="py-0.5"><button className="text-slate-400 hover:text-red-500" onClick={() => removeRow(i)}><Trash2 className="h-3 w-3" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <button className="btn-ghost text-xs mt-2" onClick={addRow}>+ 添加行</button>
        </div>
        <div className="card-glass p-4 flex-shrink-0">
          <label className="label-text">拟合模型</label>
          <select className="input-field mb-3" value={s.fitModel} onChange={e => s.setFitModel(e.target.value)}>
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn-primary w-full" onClick={handleFit}><Calculator className="h-4 w-4" />开始拟合</button>
        </div>
      </div>

      <div className="w-[65%] flex flex-col gap-3 min-w-0">
        <div className="card-glass p-4 flex-1 min-h-0">
          <ReactEChartsCore option={chartOption} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate />
        </div>
        {s.fitResult && (
          <div className="card-glass p-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">拟合结果</h3>
              <button className="btn-ghost text-xs" onClick={exportReport}><Download className="h-3.5 w-3.5" />导出报告</button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><h4 className="text-xs font-medium text-slate-500 mb-2">拟合公式</h4><div ref={formulaRef} className="text-base" /></div>
              <div><h4 className="text-xs font-medium text-slate-500 mb-2">拟合参数</h4>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-400 border-b"><th className="py-1 pr-2">参数</th><th className="py-1 pr-2">值</th><th className="py-1">标准误</th></tr></thead>
                  <tbody>{s.fitResult.params.map((p: any) => (
                    <tr key={p.name} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-0.5 pr-2 font-mono">{p.name}</td><td className="py-0.5 pr-2 font-mono text-primary-600">{p.value}</td><td className="py-0.5 font-mono text-slate-500">{p.std_err ?? '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div><h4 className="text-xs font-medium text-slate-500 mb-2">拟合优度</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">R²</span><span className="font-mono font-semibold text-primary-600">{s.fitResult.r_squared}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">RMSE</span><span className="font-mono font-semibold text-tech-red">{s.fitResult.rmse}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
