# EMS 粘度计数据分析平台 — 架构文档

## 目录结构

```
D:\codex\3\
├── 3.md                           # 原始需求文档
├── rpm_tracker.py                 # 原始桌面版 RPM 跟踪脚本（参考，不参与运行）
├── 上下文/                         # 实验上下文文件目录（用户自行添加 .md 文件）
├── backend/                       # Python 后端
│   ├── main.py                    # FastAPI 入口，路由注册
│   ├── models.py                  # Pydantic 数据模型
│   ├── config.py                  # 全局配置（AI API、上下文加载函数）
│   ├── rpm_tracker_core.py        # RPM 跟踪核心算法
│   ├── video_processor.py         # 视频上传、ROI 管理、跟踪任务管理
│   ├── data_fitter.py             # 数据拟合（scipy curve_fit）
│   ├── ai_assistant.py            # LLM 对话 / 数据分析（流式 SSE）
│   ├── context_loader.py          # 上下文文件加载器（.md/.pdf/.docx）
│   ├── roi_selector.py            # ROI 坐标校验工具
│   └── requirements.txt
├── frontend/                      # React + Vite + Tailwind 前端
│   ├── vite.config.ts             # Vite 配置（代理到 127.0.0.1:8000）
│   ├── tailwind.config.js         # Tailwind 主题（深蓝/科技色系）
│   └── src/
│       ├── App.tsx                # 路由注册 + 全局 Provider
│       ├── main.tsx               # 入口
│       ├── index.css              # 全局样式（暗色模式、组件样式）
│       ├── api/client.ts          # 后端 API 调用封装
│       ├── store/AppState.tsx     # 全局状态 Context（拟合、AI、实验说明）
│       ├── hooks/useTheme.tsx     # 深色/浅色切换
│       ├── components/Layout.tsx  # 左侧导航 + 主题切换
│       └── pages/
│           ├── VideoTrack.tsx     # 视频跟踪页
│           ├── DataFit.tsx        # 数据拟合页
│           ├── AIAssistant.tsx    # AI 助手页
│           └── ExperimentNotes.tsx # 实验说明页
├── uploads/                       # 上传的视频和首帧截图
└── results/                       # 跟踪结果 CSV
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Python 3.10+, FastAPI, Uvicorn |
| 视频处理 | OpenCV-Python, NumPy |
| 数据拟合 | SciPy (curve_fit) |
| AI | OpenAI SDK（兼容 DeepSeek/Kimi 等） |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| CSS | Tailwind CSS 3, @tailwindcss/typography |
| 图表 | ECharts (echarts-for-react) |
| 公式渲染 | KaTeX (remark-math + rehype-katex) |
| 图标 | Lucide React |
| Markdown | react-markdown + remark-gfm |

---

## 架构总览

```
浏览器 (React SPA)
    │
    │  Vite 代理: /api → http://127.0.0.1:8000
    │
    ▼
FastAPI 后端
    │
    ├── /api/upload          视频上传 → 返回 video_id + 首帧 URL
    ├── /api/roi             ROI 框选 → 存坐标到内存
    ├── /api/track/start     启动跟踪 → 开线程逐帧处理
    ├── /api/track/status    查询进度（轮询 500ms）
    ├── /api/track/result    获取 CSV + 汇总
    ├── /api/track/stream    MJPEG 流式视频（浏览器逐帧播放）
    ├── /api/fit             数据拟合 → scipy curve_fit
    ├── /api/ai/chat         流式 AI 对话（SSE）
    ├── /api/ai/analyze      流式 AI 数据分析（SSE）
    └── /api/experiment/*    实验上下文 CRUD
```

---

## 后端模块详解

### 1. `rpm_tracker_core.py` — RPM 跟踪核心

**移植自** `D:\codex\3\rpm_tracker.py`，去掉 OpenCV GUI（`cv2.imshow`/`cv2.waitKey`/`select_roi`）。

#### 核心类: `DiskRPMMeter`

| 方法 | 功能 |
|------|------|
| `setup(center, a, b, frame_shape)` | 初始化 ROI 并构建极坐标映射表 |
| `build_polar_map(shape)` | 椭圆→极坐标变换，360 角度 × 120 径向 |
| `find_line_angle(polar_gray)` | 径向平均 → 高斯平滑 → 抛物亚像素精化 → 返回角度 + 置信度 |
| `update_rpm(angle, time, confidence, fps)` | 3 种 RPM：帧间瞬时、滑动平均（动态窗口）、过零检测 |

#### 引擎函数: `process_video()`

```python
def process_video(video_path, center, a, b, output_csv=None) -> Generator
```

- 逐帧读取视频，每帧：灰度 → 极坐标映射 → 黑线检测 → RPM 更新 → CSV 写入 → `yield (data_dict, raw_frame)`
- `data_dict` 包含：frame、time_s、angle_deg、rpm_smooth、rpm_cross、confidence、progress、total_frames
- 最后 `yield` 包含 `done: True` 和 `summary`（平均/最大/最小 RPM、标准差）

#### 渲染函数: `render_annotated_frame()`

- 从原始帧绘制 OpenCV 标注：绿色椭圆 ROI、红色中心点、黄色角度线、灰色径向圈、RPM/角度/帧号文字
- 缩放高度 480px，JPEG 质量 92

---

### 2. `video_processor.py` — 任务管理

#### 数据结构

```python
tasks: dict = {}   # key = video_id
# tasks[video_id] = {
#     "roi": {"x": int, "y": int, "a": int, "b": int},
#     "tracking": {
#         "task_id": str, "status": "running"|"completed"|"error",
#         "progress": float, "current_frame": int, "total_frames": int,
#         "current_rpm": float, "current_angle": float,
#         "current_frame_jpg": bytes,  # MJPEG 流缓存
#         "summary": {...},
#     }
# }
```

#### 关键函数

| 函数 | 功能 |
|------|------|
| `save_upload()` | 保存视频文件 + 提取首帧截图 → 返回 video_id |
| `set_roi()` | 存 ROI 中心/半轴到 tasks 字典 |
| `start_tracking()` | 开 daemon 线程跑 `process_video`，线程每帧渲染标注 JPEG |
| `get_track_status()` | 通过 task_id 查进度（线程安全，带锁） |
| `get_tracking_frame_jpg()` | 返回最新的渲染标注帧（用于 MJPEG 流） |

---

### 3. `main.py` — API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/upload` | POST | 上传视频（multipart/form-data），返回 `video_id`、`first_frame_url`、fps、帧数等 |
| `/api/roi` | POST | 设置 ROI：`{video_id, x, y, a, b}`（中心 + 半轴） |
| `/api/track/start` | POST | 启动跟踪线程，返回 `task_id` |
| `/api/track/status/{task_id}` | GET | 轮询进度：progress、current_rpm、current_frame 等 |
| `/api/track/result/{task_id}` | GET | 返回 CSV 数据 + 汇总统计 |
| `/api/track/result/{task_id}/csv` | GET | 下载 CSV 文件 |
| `/api/track/stream/{task_id}` | GET | MJPEG 流：`multipart/x-mixed-replace`，浏览器原生逐帧播放 |
| `/api/fit` | POST | 数据拟合：`{x, y, model}` → 返回参数、R²、RMSE、拟合曲线 |
| `/api/ai/chat` | POST | 流式 AI 对话（SSE），含实验上下文 system prompt |
| `/api/ai/analyze` | POST | 流式 AI 数据分析（SSE） |
| `/api/experiment/notes` | GET | 返回实验说明页内容（`上下文/实验说明.md`） |
| `/api/experiment/context` | GET | 返回完整实验上下文（所有上下文文件合并） |
| `/api/experiment/context/reload` | POST | 重新加载上下文文件 |

---

### 4. `data_fitter.py` — 数据拟合

支持的拟合模型（通过 scipy.optimize.curve_fit 实现）：

| 模型 | key | 公式 |
|------|-----|------|
| 线性 | `linear` | y = ax + b |
| 正比例 | `linear_zero` | y = kx |
| 二次 | `quadratic` | y = ax² + bx + c |
| 指数 | `exponential` | y = a·e^(bx) |
| 对数 | `logarithmic` | y = a·ln(x) + b |
| 反比例 | `reciprocal` | y = k/x + b |

返回值：模型 key、公式（LaTeX）、参数（值+标准误差）、R²、RMSE、拟合曲线数据。

---

### 5. `ai_assistant.py` — LLM 对话

- 通过 `config.py` 的 `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` 配置
- 兼容 OpenAI、DeepSeek、Kimi 等所有 OpenAI 格式 API
- `chat_stream()`: 流式 SSE 响应，system prompt = 专业物理实验助手 + 实验上下文
- `analyze_data()`: 数据 + 问题 → AI 分析趋势/异常点/拟合建议

---

### 6. `context_loader.py` — 上下文加载

- 已加载内容在 System Prompt 中自动注入

---

### 7. `config.py` — 配置

```python
LLM_API_KEY = ""           # 填入即启用 AI
LLM_BASE_URL = "https://api.deepseek.com/v1"
LLM_MODEL = "deepseek-chat"
```

- API 未配置时 AI 功能返回提示文字，不影响其他功能

---

## 前端模块详解

### 1. 全局状态 `store/AppState.tsx`

Context Provider 位于 `<BrowserRouter>` 之外，路由切换不销毁，保留跨页面状态：

| 状态 | 用途 |
|------|------|
| `expContext` | 实验上下文（优先 localStorage，其次 API） |
| `chatMessages` | AI 对话历史（localStorage 持久化） |
| `fitRows/fitXName/...` | 数据拟合页的输入数据 |
| `fitResult` | 拟合结果 |
| `notesContent/notesLoaded` | 实验说明页内容 |

**不在全局状态的（页面独立）**：视频跟踪的所有状态（videoId、roiRect、rpmData 等），因为不需要跨页面保留。

### 2. 视频跟踪页 `VideoTrack.tsx`

**布局**：左 35%（上传+ROI） + 右 65%（图表+表格）

**ROI 框选流程**：
1. 上传视频 → 后端返回 `first_frame_url` → `<img>` 加载显示
2. 鼠标拖拽 → 蓝色虚线矩形 + 黄色椭圆 + 红色中心点叠加层
3. 松开 → `center = (x+w//2, y+h//2)`, `a=w//2`, `b=h//2` → POST `/api/roi`

**跟踪流程**：
1. 点击开始 → POST `/api/track/start`
2. `<img src="/api/track/stream/{task_id}">` → MJPEG 流逐帧播放
3. `setInterval` 500ms → GET `/api/track/status` → 更新进度条 + ECharts 图表
4. 完成 → GET `/api/track/result` → 下载 CSV + 汇总统计表

### 3. 数据拟合页 `DataFit.tsx`

- 数据输入：手动填表 / 粘贴 CSV / 从跟踪结果导入
- 自定义轴名、轴单位
- 6 种拟合模型选择
- ECharts 散点图 + 拟合曲线
- KaTeX 渲染拟合公式
- 参数表（值 + 标准误）+ R² + RMSE
- JSON 报告导出

### 4. AI 助手页 `AIAssistant.tsx`

- 左 60%：对话区（流式回复，支持停止）
- 右 40%：数据分析面板（粘贴数据 → AI 分析）
- 对话历史 localStorage 持久化
- 实验上下文可编辑/保存（影响 AI 回答质量）

### 5. 实验说明页 `ExperimentNotes.tsx`

- Markdown 渲染（含 KaTeX 数学公式）
- 编辑/保存（localStorage 持久化）
- 首次加载从后端 API 取默认内容

---

## 关键数据流

### 视频跟踪（核心链路）

```
用户上传视频
    → POST /api/upload → 存到 uploads/xxx.mp4 + 提取首帧到 uploads/frames/xxx.jpg
    → 响应: { video_id, first_frame_url, fps, total_frames }

用户框选 ROI
    → POST /api/roi { video_id, x, y, a, b }
    → 后端: tasks[video_id]["roi"] = {x,y,a,b}

用户点击"开始跟踪"
    → POST /api/track/start { video_id }
    → 后端: 开线程 → process_video(path, center, a, b)
       每帧: 读帧 → 灰度 → 极坐标映射 → find_line_angle → update_rpm → CSV 写入
       每帧: render_annotated_frame → 存 current_frame_jpg
    → 响应: { task_id }

前端轮询进度
    → GET /api/track/status/{task_id}  (每 500ms)
    ← { progress, current_rpm, current_angle, current_frame, total_frames }

前端实时画面
    → GET /api/track/stream/{task_id}  (MJPEG)
    ← multipart/x-mixed-replace 流，浏览器自动逐帧渲染

跟踪完成
    → GET /api/track/result/{task_id}
    ← { csv_data: [...], summary: { avg_rpm, max_rpm, min_rpm, std_rpm } }
```

### AI 对话链路

```
前端发送消息
    → POST /api/ai/chat { messages: [...], experiment_context: "..." }
    ↓
后端构建 system prompt:
    "你是专业的物理实验助手" + 实验上下文(所有上下文文件夹内的文本) + 用户补充上下文
    ↓
调用 LLM API（OpenAI 格式，流式）
    ↓
SSE 流返回: data: {"content": "..."}\n\n ... data: [DONE]\n\n
    ↓
前端逐字显示
```

---

## 如何修改/扩展

### 修改 RPM 跟踪参数

编辑 `backend/rpm_tracker_core.py`：

```python
NUM_ANGULAR = 360        # 极坐标角度分辨率
NUM_RADIAL = 120         # 极坐标径向分辨率
RADIAL_MIN_FRAC = 0.35   # 有效径向范围起始比例
RADIAL_MAX_FRAC = 0.90   # 有效径向范围结束比例
```

### 添加新拟合模型

编辑 `backend/data_fitter.py`，在 `MODELS` 字典中添加：

```python
"my_model": (_my_fn, "公式文本", "LaTeX公式", ["参数名1", "参数名2"], [初始值1, 初始值2]),
```

### 修改 MJPEG 流画质

编辑 `backend/rpm_tracker_core.py` 的 `render_annotated_frame`：

```python
display_height=480              # 缩放高度
[cv2.IMWRITE_JPEG_QUALITY, 92]  # JPEG 质量
```

### 修改 AI 模型/API

编辑 `backend/config.py`：

```python
LLM_API_KEY = "sk-xxx"
LLM_BASE_URL = "https://api.openai.com/v1"
LLM_MODEL = "gpt-4o"
```

### 添加/修改实验上下文

在 `D:\codex\3\上下文\` 目录添加 `.md`/`.txt`/`.pdf`/`.docx` 文件，重启后端或调用 `POST /api/experiment/context/reload` 即可生效。

### 修改前端配色

编辑 `frontend/tailwind.config.js` 的 `theme.extend.colors`。

### 修改前端页面布局

各页面在 `frontend/src/pages/` 目录，左侧导航在 `frontend/src/components/Layout.tsx`。

---

## 启动方式

```bash
# 后端
cd D:\codex\3\backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 前端
cd D:\codex\3\frontend
npm install
npm run dev
```

访问 `http://localhost:3000`

---

## 日志

后端日志输出到控制台（uvicorn），关键打印位置：

- `config.py:check_config()` → AI API 配置状态
- `context_loader.py` → `[context] Loaded/Skipped/Failed: filename`
- `video_processor.py` → 跟踪状态变更（线程内）
- `rpm_tracker_core.py` → 无（纯计算逻辑，不打印）

错误通过 FastAPI 的 HTTPException 返回前端，前端用红色提示框显示。
