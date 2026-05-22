# EMS 粘度计数据分析平台

基于 OpenCV 的抗磁悬浮电磁旋转粘度计视频转速跟踪与数据分析 Web 应用。

## 功能

- **视频上传与 ROI 框选**：上传实验视频，在首帧上用鼠标拖拽框选探针磁盘区域
- **逐帧 RPM 跟踪**：椭圆极坐标映射 → 黑线角度亚像素检测 → 帧间瞬时 + 滑动平均 + 过零检测三重 RPM 计算
- **实时可视化**：MJPEG 流式逐帧播放跟踪画面（60fps），含 OpenCV 标注（椭圆 ROI、角度指示线、RPM 数字）
- **RPM 曲线与数据表**：ECharts 实时绘制转速-时间曲线，跟踪完成后自动 5 次多项式拟合去异常值
- **数据拟合**：支持 6 种拟合模型（线性/正比例/二次/指数/对数/反比例），KaTeX 渲染公式，导出 JSON 报告
- **AI 实验助手**：兼容 OpenAI/DeepSeek/Kimi 等 API，可对话答疑、数据分析、拟合建议（SSE 流式）
- **实验说明页**：Markdown 渲染，含 KaTeX 数学公式
- **深色/浅色模式切换**，响应式布局

## 快速开始

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

访问 `http://localhost:3000`

### 配置 AI（可选）

编辑 `backend/config.py`：

```python
LLM_API_KEY = "sk-你的密钥"
LLM_BASE_URL = "https://api.deepseek.com/v1"
LLM_MODEL = "deepseek-chat"
```

不配置 API Key 时 AI 功能提示不可用，不影响视频跟踪等核心功能。

## 项目结构

```
├── backend/
│   ├── main.py               # FastAPI 入口，13 个 API 端点
│   ├── models.py             # Pydantic 数据模型
│   ├── config.py             # 全局配置（AI API、上下文加载）
│   ├── rpm_tracker_core.py   # RPM 跟踪核心算法（从 rpm_tracker.py 移植）
│   ├── video_processor.py    # 视频上传、ROI 管理、跟踪任务管理
│   ├── data_fitter.py        # 数据拟合（scipy，6 种模型）
│   ├── ai_assistant.py       # LLM 对话/数据分析（SSE 流式）
│   ├── context_loader.py     # 实验上下文文件加载（.md/.pdf/.docx）
│   └── requirements.txt
├── frontend/
│   ├── vite.config.ts        # Vite 配置（API 代理）
│   ├── tailwind.config.js    # Tailwind 主题色系
│   └── src/
│       ├── api/client.ts     # 后端 API 封装
│       ├── store/AppState.tsx # 全局状态 Context
│       ├── components/Layout.tsx # 导航 + 主题切换
│       ├── pages/
│       │   ├── VideoTrack.tsx    # 视频跟踪页
│       │   ├── DataFit.tsx       # 数据拟合页
│       │   ├── AIAssistant.tsx   # AI 助手页
│       │   └── ExperimentNotes.tsx # 实验说明页
│       └── hooks/useTheme.tsx    # 主题切换 Hook
├── 上下文/                    # 实验上下文目录（Markdown 文件）
│   ├── 实验说明.md
│   ├── AI背景知识.md
│   └── 公式推导.md
├── rpm_tracker.py            # 原始桌面版参考脚本
└── ARCHITECTURE.md           # 架构文档
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/upload` | POST | 上传视频，返回 video_id + 首帧 URL |
| `/api/roi` | POST | 设置 ROI（中心 + 半轴） |
| `/api/track/start` | POST | 启动跟踪线程，返回 task_id |
| `/api/track/status/{id}` | GET | 轮询进度（progress / rpm / frame） |
| `/api/track/stream/{id}` | GET | MJPEG 流式视频（浏览器原生逐帧） |
| `/api/track/result/{id}` | GET | 获取 CSV + 汇总统计 + RPM 拟合数据 |
| `/api/track/result/{id}/csv` | GET | 下载 CSV 文件 |
| `/api/fit` | POST | 数据拟合（6 种模型） |
| `/api/ai/chat` | POST | 流式 AI 对话（SSE） |
| `/api/ai/analyze` | POST | 流式 AI 数据分析（SSE） |
| `/api/experiment/notes` | GET | 实验说明内容 |
| `/api/experiment/context` | GET | 完整实验上下文 |
| `/api/experiment/context/reload` | POST | 重新加载上下文文件 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.10+ / FastAPI / OpenCV / SciPy |
| 前端 | React 18 / TypeScript / Vite 5 / Tailwind CSS 3 |
| 图表 | ECharts |
| 公式 | KaTeX |
| AI | OpenAI SDK（兼容式调用） |

## RPM 跟踪算法

从 `rpm_tracker.py` 移植，核心流程：

1. **椭圆 ROI 极坐标映射**：矩形框选 → 椭圆参数（center, a, b）→ 极坐标变换（360 角度 × 120 径向）
2. **黑线角度检测（亚像素）**：径向平均 → 高斯平滑 → 抛物线插值 → 角度 + 置信度
3. **RPM 计算（3 种互补）**：帧间瞬时、一圈滑动平均（动态窗口）、过零检测
4. **低置信度处理**：< 0.10 时用历史角速度预测当前角度

## 添加实验上下文

在 `上下文/` 目录添加 `.md` 文件，重启后端或调用 `POST /api/experiment/context/reload` 即可。支持 `.md` / `.txt` / `.pdf` / `.docx` 格式。

## 详细架构文档

参见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## License

MIT
