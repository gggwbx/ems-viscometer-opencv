# EMS Viscometer — OpenCV RPM Tracking Platform

An OpenCV-based electromagnetic rotational viscometer video RPM tracking and data analysis web application.

## Features

- **Video Upload & ROI Selection**: Upload experiment video, drag to select disk region on the first frame
- **Frame-by-Frame RPM Tracking**: Elliptical polar coordinate mapping → black line angle sub-pixel detection → triple RPM calculation (inter-frame instantaneous / sliding average / zero-crossing detection)
- **Real-time Visualization**: MJPEG stream frame-by-frame playback with tracking overlay, featuring OpenCV annotations (elliptical ROI, angle line, RPM values)
- **RPM Curve & Data Table**: Real-time ECharts plotting, automatic polynomial fitting and outlier removal after tracking completes
- **Data Fitting**: 6 models (Linear / Proportional / Quadratic / Exponential / Logarithmic / Reciprocal), KaTeX rendered formulas, JSON export
- **AI Experiment Assistant**: Compatible with OpenAI / DeepSeek / Kimi APIs, SSE streaming conversation + data analysis
- **Experiment Notes Page**: Markdown rendering with formula support
- **Dark/Light Mode**

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000`

### Configure AI (Optional)

Edit `backend/config.py`:

```python
LLM_API_KEY = "sk-your-key"
LLM_BASE_URL = "https://api.deepseek.com/v1"
LLM_MODEL = "deepseek-chat"
```

Core functionality works without AI configuration.

## Project Structure

```
├── backend/
│   ├── main.py               # FastAPI entry point
│   ├── rpm_tracker_core.py   # RPM tracking core algorithm
│   ├── video_processor.py    # Video upload / task management
│   ├── data_fitter.py        # Data fitting (scipy / 6 models)
│   ├── ai_assistant.py       # LLM conversation (SSE streaming)
│   ├── context_loader.py     # Experiment context loader
│   ├── config.py             # Global configuration
│   ├── models.py             # Pydantic data models
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── VideoTrack.tsx    # Video tracking
│       │   ├── DataFit.tsx       # Data fitting
│       │   ├── AIAssistant.tsx   # AI assistant
│       │   └── ExperimentNotes.tsx # Experiment notes
│       ├── store/AppState.tsx     # Global state
│       └── api/client.ts          # API wrapper
├── context/                  # Experiment context directory (user adds .md files)
├── rpm_tracker.py            # Reference: original desktop script
└── ARCHITECTURE.md           # Architecture documentation
```

## API

| Endpoint | Method | Description |
|------|------|------|
| `/api/upload` | POST | Upload video |
| `/api/roi` | POST | Set ROI |
| `/api/track/start` | POST | Start tracking |
| `/api/track/status/{id}` | GET | Query progress |
| `/api/track/stream/{id}` | GET | MJPEG real-time view |
| `/api/track/result/{id}` | GET | Get results + RPM fitting |
| `/api/track/result/{id}/csv` | GET | Download CSV |
| `/api/fit` | POST | Data fitting |
| `/api/ai/chat` | POST | AI conversation |
| `/api/ai/analyze` | POST | AI data analysis |
| `/api/experiment/context` | GET | Experiment context |

## Tech Stack

Python / FastAPI / OpenCV / SciPy  |  React / TypeScript / Vite / Tailwind CSS  |  ECharts / KaTeX

## Adding Context

Place `.md` files in the `context/` directory, restart the backend or call `POST /api/experiment/context/reload`.

## Detailed Documentation

See [ARCHITECTURE.md](ARCHITECTURE.md)
