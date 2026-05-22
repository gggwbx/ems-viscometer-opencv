# EMS Viscometer Data Analysis Platform — Architecture Document

## Directory Structure

```
D:\codex\3\
├── 3.md                           # Original requirements document
├── rpm_tracker.py                 # Original desktop RPM tracking script (reference only, not used at runtime)
├── context/                       # Experiment context file directory (user adds .md files)
├── backend/                       # Python backend
│   ├── main.py                    # FastAPI entry point, route registration
│   ├── models.py                  # Pydantic data models
│   ├── config.py                  # Global configuration (AI API, context loading functions)
│   ├── rpm_tracker_core.py        # RPM tracking core algorithm
│   ├── video_processor.py         # Video upload, ROI management, tracking task management
│   ├── data_fitter.py             # Data fitting (scipy curve_fit)
│   ├── ai_assistant.py            # LLM conversation / data analysis (streaming SSE)
│   ├── context_loader.py          # Context file loader (.md/.pdf/.docx)
│   ├── roi_selector.py            # ROI coordinate validation tool
│   └── requirements.txt
├── frontend/                      # React + Vite + Tailwind frontend
│   ├── vite.config.ts             # Vite configuration (proxy to 127.0.0.1:8000)
│   ├── tailwind.config.js         # Tailwind theme (dark blue / tech color scheme)
│   └── src/
│       ├── App.tsx                # Route registration + global Provider
│       ├── main.tsx               # Entry point
│       ├── index.css              # Global styles (dark mode, component styles)
│       ├── api/client.ts          # Backend API call wrapper
│       ├── store/AppState.tsx     # Global state Context (fitting, AI, experiment notes)
│       ├── hooks/useTheme.tsx     # Dark/light mode toggle
│       ├── components/Layout.tsx  # Left sidebar navigation + theme toggle
│       └── pages/
│           ├── VideoTrack.tsx     # Video tracking page
│           ├── DataFit.tsx        # Data fitting page
│           ├── AIAssistant.tsx    # AI assistant page
│           └── ExperimentNotes.tsx # Experiment notes page
├── uploads/                       # Uploaded videos and first-frame screenshots
└── results/                       # Tracking result CSV files
```

---

## Tech Stack

| Layer | Technology |
|------|------|
| Backend Framework | Python 3.10+, FastAPI, Uvicorn |
| Video Processing | OpenCV-Python, NumPy |
| Data Fitting | SciPy (curve_fit) |
| AI | OpenAI SDK (compatible with DeepSeek/Kimi, etc.) |
| Frontend Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| CSS | Tailwind CSS 3, @tailwindcss/typography |
| Charts | ECharts (echarts-for-react) |
| Formula Rendering | KaTeX (remark-math + rehype-katex) |
| Icons | Lucide React |
| Markdown | react-markdown + remark-gfm |

---

## Architecture Overview

```
Browser (React SPA)
    │
    │  Vite proxy: /api → http://127.0.0.1:8000
    │
    ▼
FastAPI Backend
    │
    ├── /api/upload          Video upload → returns video_id + first frame URL
    ├── /api/roi             ROI selection → stores coordinates in memory
    ├── /api/track/start     Start tracking → spawns thread for frame-by-frame processing
    ├── /api/track/status    Query progress (poll every 500ms)
    ├── /api/track/result    Get CSV + summary
    ├── /api/track/stream    MJPEG streaming video (browser frame-by-frame playback)
    ├── /api/fit             Data fitting → scipy curve_fit
    ├── /api/ai/chat         Streaming AI conversation (SSE)
    ├── /api/ai/analyze      Streaming AI data analysis (SSE)
    └── /api/experiment/*    Experiment context CRUD
```

---

## Backend Module Details

### 1. `rpm_tracker_core.py` — RPM Tracking Core

**Ported from** `D:\codex\3\rpm_tracker.py`, with OpenCV GUI removed (`cv2.imshow`/`cv2.waitKey`/`select_roi`).

#### Core Class: `DiskRPMMeter`

| Method | Function |
|------|------|
| `setup(center, a, b, frame_shape)` | Initialize ROI and build polar coordinate mapping table |
| `build_polar_map(shape)` | Ellipse → polar coordinate transform, 360 angular × 120 radial |
| `find_line_angle(polar_gray)` | Radial average → Gaussian smoothing → parabolic sub-pixel refinement → returns angle + confidence |
| `update_rpm(angle, time, confidence, fps)` | 3 RPM types: inter-frame instantaneous, sliding average (dynamic window), zero-crossing detection |

#### Engine Function: `process_video()`

```python
def process_video(video_path, center, a, b, output_csv=None) -> Generator
```

- Reads video frame by frame, each frame: grayscale → polar mapping → black line detection → RPM update → CSV write → `yield (data_dict, raw_frame)`
- `data_dict` contains: frame, time_s, angle_deg, rpm_smooth, rpm_cross, confidence, progress, total_frames
- Final `yield` contains `done: True` and `summary` (average/max/min RPM, standard deviation)

#### Render Function: `render_annotated_frame()`

- Draws OpenCV annotations on raw frame: green elliptical ROI, red center point, yellow angle line, gray radial rings, RPM/angle/frame number text
- Scale height to 480px, JPEG quality 92

---

### 2. `video_processor.py` — Task Management

#### Data Structures

```python
tasks: dict = {}   # key = video_id
# tasks[video_id] = {
#     "roi": {"x": int, "y": int, "a": int, "b": int},
#     "tracking": {
#         "task_id": str, "status": "running"|"completed"|"error",
#         "progress": float, "current_frame": int, "total_frames": int,
#         "current_rpm": float, "current_angle": float,
#         "current_frame_jpg": bytes,  # MJPEG stream cache
#         "summary": {...},
#     }
# }
```

#### Key Functions

| Function | Description |
|------|------|
| `save_upload()` | Save video file + extract first-frame screenshot → return video_id |
| `set_roi()` | Store ROI center/semi-axes to tasks dictionary |
| `start_tracking()` | Spawn daemon thread to run `process_video`, thread renders annotated JPEG per frame |
| `get_track_status()` | Query progress by task_id (thread-safe, with lock) |
| `get_tracking_frame_jpg()` | Return latest rendered annotated frame (for MJPEG stream) |

---

### 3. `main.py` — API Endpoints

| Endpoint | Method | Description |
|------|------|------|
| `/api/upload` | POST | Upload video (multipart/form-data), returns `video_id`, `first_frame_url`, fps, frame count, etc. |
| `/api/roi` | POST | Set ROI: `{video_id, x, y, a, b}` (center + semi-axes) |
| `/api/track/start` | POST | Start tracking thread, returns `task_id` |
| `/api/track/status/{task_id}` | GET | Poll progress: progress, current_rpm, current_frame, etc. |
| `/api/track/result/{task_id}` | GET | Returns CSV data + summary statistics |
| `/api/track/result/{task_id}/csv` | GET | Download CSV file |
| `/api/track/stream/{task_id}` | GET | MJPEG stream: `multipart/x-mixed-replace`, browser-native frame-by-frame playback |
| `/api/fit` | POST | Data fitting: `{x, y, model}` → returns parameters, R², RMSE, fitted curve |
| `/api/ai/chat` | POST | Streaming AI conversation (SSE), includes experiment context system prompt |
| `/api/ai/analyze` | POST | Streaming AI data analysis (SSE) |
| `/api/experiment/notes` | GET | Returns experiment notes page content (`context/实验说明.md`) |
| `/api/experiment/context` | GET | Returns complete experiment context (all context files merged) |
| `/api/experiment/context/reload` | POST | Reload context files |

---

### 4. `data_fitter.py` — Data Fitting

Supported fitting models (implemented via scipy.optimize.curve_fit):

| Model | Key | Formula |
|------|-----|------|
| Linear | `linear` | y = ax + b |
| Proportional | `linear_zero` | y = kx |
| Quadratic | `quadratic` | y = ax² + bx + c |
| Exponential | `exponential` | y = a·e^(bx) |
| Logarithmic | `logarithmic` | y = a·ln(x) + b |
| Reciprocal | `reciprocal` | y = k/x + b |

Return values: model key, formula (LaTeX), parameters (value + standard error), R², RMSE, fitted curve data.

---

### 5. `ai_assistant.py` — LLM Conversation

- Configured via `config.py`'s `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL`
- Compatible with OpenAI, DeepSeek, Kimi, and all OpenAI-format APIs
- `chat_stream()`: Streaming SSE response, system prompt = professional physics experiment assistant + experiment context
- `analyze_data()`: Data + question → AI analyzes trends/outliers/fitting suggestions

---

### 6. `context_loader.py` — Context Loading

- Loaded content is automatically injected into the System Prompt

---

### 7. `config.py` — Configuration

```python
LLM_API_KEY = ""           # Fill in to enable AI
LLM_BASE_URL = "https://api.deepseek.com/v1"
LLM_MODEL = "deepseek-chat"
```

- When API is not configured, AI features return a hint message without affecting other functionality

---

## Frontend Module Details

### 1. Global State `store/AppState.tsx`

Context Provider is placed outside `<BrowserRouter>`, so routing switches do not destroy it, preserving cross-page state:

| State | Purpose |
|------|------|
| `expContext` | Experiment context (localStorage first, then API) |
| `chatMessages` | AI conversation history (localStorage persisted) |
| `fitRows/fitXName/...` | Data fitting page input data |
| `fitResult` | Fitting result |
| `notesContent/notesLoaded` | Experiment notes page content |

**Not in global state (page-local)**: All video tracking state (videoId, roiRect, rpmData, etc.), as cross-page persistence is not needed.

### 2. Video Tracking Page `VideoTrack.tsx`

**Layout**: Left 35% (upload + ROI) + Right 65% (chart + table)

**ROI Selection Flow**:
1. Upload video → backend returns `first_frame_url` → `<img>` loads and displays
2. Mouse drag → blue dashed rectangle + yellow ellipse + red center point overlay
3. Release → `center = (x+w//2, y+h//2)`, `a=w//2`, `b=h//2` → POST `/api/roi`

**Tracking Flow**:
1. Click start → POST `/api/track/start`
2. `<img src="/api/track/stream/{task_id}">` → MJPEG stream frame-by-frame playback
3. `setInterval` 500ms → GET `/api/track/status` → update progress bar + ECharts chart
4. Complete → GET `/api/track/result` → download CSV + summary statistics table

### 3. Data Fitting Page `DataFit.tsx`

- Data input: manual table entry / paste CSV / import from tracking results
- Custom axis names, axis units
- 6 fitting model options
- ECharts scatter plot + fitted curve
- KaTeX rendered fitting formula
- Parameter table (value + standard error) + R² + RMSE
- JSON report export

### 4. AI Assistant Page `AIAssistant.tsx`

- Left 60%: conversation area (streaming replies, supports stop)
- Right 40%: data analysis panel (paste data → AI analysis)
- Conversation history localStorage persisted
- Experiment context editable/saveable (affects AI response quality)

### 5. Experiment Notes Page `ExperimentNotes.tsx`

- Markdown rendering (including KaTeX math formulas)
- Edit/save (localStorage persisted)
- First load fetches default content from backend API

---

## Key Data Flows

### Video Tracking (Core Pipeline)

```
User uploads video
    → POST /api/upload → saves to uploads/xxx.mp4 + extracts first frame to uploads/frames/xxx.jpg
    → Response: { video_id, first_frame_url, fps, total_frames }

User selects ROI
    → POST /api/roi { video_id, x, y, a, b }
    → Backend: tasks[video_id]["roi"] = {x,y,a,b}

User clicks "Start Tracking"
    → POST /api/track/start { video_id }
    → Backend: spawns thread → process_video(path, center, a, b)
       Per frame: read frame → grayscale → polar mapping → find_line_angle → update_rpm → CSV write
       Per frame: render_annotated_frame → store current_frame_jpg
    → Response: { task_id }

Frontend polls progress
    → GET /api/track/status/{task_id}  (every 500ms)
    ← { progress, current_rpm, current_angle, current_frame, total_frames }

Frontend real-time view
    → GET /api/track/stream/{task_id}  (MJPEG)
    ← multipart/x-mixed-replace stream, browser auto-renders frame by frame

Tracking complete
    → GET /api/track/result/{task_id}
    ← { csv_data: [...], summary: { avg_rpm, max_rpm, min_rpm, std_rpm } }
```

### AI Conversation Pipeline

```
Frontend sends message
    → POST /api/ai/chat { messages: [...], experiment_context: "..." }
    ↓
Backend constructs system prompt:
    "You are a professional physics experiment assistant" + experiment context (all text from context folder) + user-supplied context
    ↓
Calls LLM API (OpenAI format, streaming)
    ↓
SSE stream returns: data: {"content": "..."}\n\n ... data: [DONE]\n\n
    ↓
Frontend displays character by character
```

---

## How to Modify / Extend

### Modify RPM Tracking Parameters

Edit `backend/rpm_tracker_core.py`:

```python
NUM_ANGULAR = 360        # Polar coordinate angular resolution
NUM_RADIAL = 120         # Polar coordinate radial resolution
RADIAL_MIN_FRAC = 0.35   # Effective radial range start ratio
RADIAL_MAX_FRAC = 0.90   # Effective radial range end ratio
```

### Add a New Fitting Model

Edit `backend/data_fitter.py`, add to the `MODELS` dictionary:

```python
"my_model": (_my_fn, "Formula text", "LaTeX Formula", ["param1", "param2"], [init1, init2]),
```

### Modify MJPEG Stream Quality

Edit `backend/rpm_tracker_core.py`'s `render_annotated_frame`:

```python
display_height=480              # Scale height
[cv2.IMWRITE_JPEG_QUALITY, 92]  # JPEG quality
```

### Modify AI Model/API

Edit `backend/config.py`:

```python
LLM_API_KEY = "sk-xxx"
LLM_BASE_URL = "https://api.openai.com/v1"
LLM_MODEL = "gpt-4o"
```

### Add/Modify Experiment Context

Add `.md`/`.txt`/`.pdf`/`.docx` files in the `D:\codex\3\context\` directory, restart backend or call `POST /api/experiment/context/reload` to take effect.

### Modify Frontend Color Scheme

Edit `frontend/tailwind.config.js`'s `theme.extend.colors`.

### Modify Frontend Page Layout

Pages are in the `frontend/src/pages/` directory, left sidebar navigation is in `frontend/src/components/Layout.tsx`.

---

## Startup

```bash
# Backend
cd D:\codex\3\backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd D:\codex\3\frontend
npm install
npm run dev
```

Visit `http://localhost:3000`

---

## Logging

Backend logs output to console (uvicorn), key log locations:

- `config.py:check_config()` → AI API configuration status
- `context_loader.py` → `[context] Loaded/Skipped/Failed: filename`
- `video_processor.py` → Tracking status changes (within thread)
- `rpm_tracker_core.py` → None (pure computation logic, no logging)

Errors are returned to frontend via FastAPI's HTTPException, displayed with red alert box.
