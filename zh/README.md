# EMS Viscometer — OpenCV RPM Tracking Platform

基于 OpenCV 的电磁旋转粘度计视频转速跟踪与数据分析 Web 应用。

## 功能

- **视频上传与 ROI 框选**：上传实验视频，在首帧上鼠标拖拽框选磁盘区域
- **逐帧 RPM 跟踪**：椭圆极坐标映射 → 黑线角度亚像素检测 → 三重 RPM 计算（帧间瞬时 / 滑动平均 / 过零检测）
- **实时可视化**：MJPEG 流逐帧播放跟踪画面，含 OpenCV 标注（椭圆 ROI、角度线、RPM 数值）
- **RPM 曲线与数据表**：ECharts 实时绘制，跟踪完成后自动多项式拟合去异常值
- **数据拟合**：6 种模型（线性 / 正比例 / 二次 / 指数 / 对数 / 反比例），KaTeX 渲染公式，导出 JSON
- **AI 实验助手**：兼容 OpenAI / DeepSeek / Kimi 等 API，SSE 流式对话 + 数据分析
- **实验说明页**：Markdown 渲染，支持公式
- **深色/浅色模式**

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

不配置也不影响核心功能。

## 项目结构

```
├── backend/
│   ├── main.py               # FastAPI 入口
│   ├── rpm_tracker_core.py   # RPM 跟踪核心算法
│   ├── video_processor.py    # 视频上传 / 任务管理
│   ├── data_fitter.py        # 数据拟合（scipy / 6 种模型）
│   ├── ai_assistant.py       # LLM 对话（SSE 流式）
│   ├── context_loader.py     # 实验上下文加载
│   ├── config.py             # 全局配置
│   ├── models.py             # Pydantic 数据模型
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── VideoTrack.tsx    # 视频跟踪
│       │   ├── DataFit.tsx       # 数据拟合
│       │   ├── AIAssistant.tsx   # AI 助手
│       │   └── ExperimentNotes.tsx # 实验说明
│       ├── store/AppState.tsx     # 全局状态
│       └── api/client.ts          # API 封装
├── 上下文/                    # 实验上下文目录（用户自行添加 .md）
├── rpm_tracker.py            # 参考：原始桌面版脚本
└── ARCHITECTURE.md           # 架构文档
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/upload` | POST | 上传视频 |
| `/api/roi` | POST | 框选 ROI |
| `/api/track/start` | POST | 启动跟踪 |
| `/api/track/status/{id}` | GET | 查询进度 |
| `/api/track/stream/{id}` | GET | MJPEG 实时画面 |
| `/api/track/result/{id}` | GET | 获取结果 + RPM 拟合 |
| `/api/track/result/{id}/csv` | GET | 下载 CSV |
| `/api/fit` | POST | 数据拟合 |
| `/api/ai/chat` | POST | AI 对话 |
| `/api/ai/analyze` | POST | AI 分析数据 |
| `/api/experiment/context` | GET | 实验上下文 |

## 技术栈

Python / FastAPI / OpenCV / SciPy ｜ React / TypeScript / Vite / Tailwind CSS ｜ ECharts / KaTeX

## 添加上下文

将 `.md` 文件放入 `上下文/` 目录，重启后端或 `POST /api/experiment/context/reload`。

## 详细文档

参见 [ARCHITECTURE.md](ARCHITECTURE.md)
