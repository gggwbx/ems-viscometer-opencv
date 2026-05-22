import os
import uuid
import json
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from models import (
    UploadResponse, RoiRequest, TrackStartResponse,
    FitRequest, FitResponse, FitParam,
    AIChatRequest, AIAnalyzeRequest,
)
import video_processor
from video_processor import (
    save_upload, set_roi, start_tracking,
    get_track_status, get_track_result,
    find_video, find_first_frame,
    get_tracking_frame_jpg,
    UPLOAD_DIR, RESULTS_DIR,
)
from data_fitter import do_fit
from ai_assistant import chat_stream, analyze_data
from config import get_experiment_context, get_experiment_notes, reload_context, get_context_file_count, check_config

app = FastAPI(title="EMS Viscosimeter Data Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/results", StaticFiles(directory=RESULTS_DIR), name="results")


@app.post("/api/upload", response_model=UploadResponse)
async def upload_video(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "No file provided")
    try:
        content = await file.read()
        info = save_upload(content, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))

    return UploadResponse(
        video_id=info["video_id"],
        filename=info["filename"],
        duration=info["duration"],
        fps=info["fps"],
        total_frames=info["total_frames"],
        first_frame_url=f"/uploads/frames/{info['video_id']}.jpg",
    )


@app.post("/api/roi")
async def set_roi_endpoint(req: RoiRequest):
    path = find_video(req.video_id)
    if path is None:
        raise HTTPException(404, "Video not found")
    set_roi(req.video_id, req.x, req.y, req.a, req.b)
    return {"status": "ok", "message": "ROI set successfully"}


@app.post("/api/track/start", response_model=TrackStartResponse)
async def track_start(req: dict):
    video_id = req.get("video_id")
    if not video_id:
        raise HTTPException(400, "video_id required")
    try:
        task_id = start_tracking(video_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return TrackStartResponse(task_id=task_id, status="started")


@app.get("/api/track/status/{task_id}")
async def track_status(task_id: str):
    for vid in list(video_processor.tasks.keys()):
        status = get_track_status(vid, task_id)
        if status:
            return status
    raise HTTPException(404, "Task not found")


@app.get("/api/track/frame/{task_id}")
async def track_frame(task_id: str):
    from fastapi.responses import Response
    jpg = get_tracking_frame_jpg(task_id)
    if jpg is None:
        raise HTTPException(404, "Frame not available")
    return Response(content=jpg, media_type="image/jpeg")


@app.get("/api/track/stream/{task_id}")
async def track_stream(task_id: str):
    """MJPEG 流式逐帧推送，浏览器原生支持无需 JS 轮询"""
    import asyncio
    from fastapi.responses import StreamingResponse

    async def generate():
        last_frame = None
        while True:
            jpg = get_tracking_frame_jpg(task_id)
            if jpg is None:
                await asyncio.sleep(0.1)
                continue
            if jpg != last_frame:
                last_frame = jpg
                yield (b"--frame\r\n"
                       b"Content-Type: image/jpeg\r\n\r\n" +
                       jpg + b"\r\n")
            else:
                await asyncio.sleep(0.05)
            # 检查任务是否结束
            from video_processor import tasks as vp_tasks
            found = False
            for vt in vp_tasks.values():
                t = vt.get("tracking", {})
                if t.get("task_id") == task_id:
                    found = True
                    if t.get("status") in ("completed", "error", "stopped"):
                        return
                    break
            if not found:
                return

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache", "Connection": "close"},
    )


@app.get("/api/track/result/{task_id}")
async def track_result(task_id: str):
    result = get_track_result(task_id)
    if result is None:
        raise HTTPException(404, "Result not found")

    csv_data = []
    if os.path.exists(result["csv_path"]):
        import csv
        with open(result["csv_path"], "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            csv_data = [row for row in reader]

    return {
        "task_id": task_id,
        "csv_data": csv_data,
        "summary": result.get("summary", {}),
        "rpm_fit": result.get("rpm_fit"),
    }


@app.get("/api/track/result/{task_id}/csv")
async def track_result_csv(task_id: str):
    csv_path = os.path.join(RESULTS_DIR, task_id, "rpm_data.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(404, "CSV not found")
    return FileResponse(csv_path, media_type="text/csv", filename=f"rpm_data_{task_id}.csv")


@app.post("/api/fit", response_model=FitResponse)
async def fit_data(req: FitRequest):
    result = do_fit(req.x, req.y, req.model)
    if "error" in result:
        raise HTTPException(400, result["error"])

    return FitResponse(
        model=result["model"],
        formula=result["formula"],
        formula_latex=result["formula_latex"],
        params=[FitParam(name=p["name"], value=p["value"], std_err=p.get("std_err")) for p in result["params"]],
        r_squared=result["r_squared"],
        rmse=result["rmse"],
        fit_x=result["fit_x"],
        fit_y=result["fit_y"],
        x_name=req.x_name,
        x_unit=req.x_unit,
        y_name=req.y_name,
        y_unit=req.y_unit,
    )


@app.post("/api/ai/chat")
async def ai_chat(req: AIChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    async def generate():
        async for chunk in chat_stream(messages, req.experiment_context):
            yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/ai/analyze")
async def ai_analyze(req: AIAnalyzeRequest):
    async def generate():
        async for chunk in analyze_data(req.data, req.question, req.experiment_context):
            yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/experiment/notes")
async def get_experiment_notes_endpoint():
    return {"notes": get_experiment_notes()}


@app.get("/api/experiment/context")
async def get_experiment_context_endpoint():
    return {"context": get_experiment_context(), "file_count": get_context_file_count()}


@app.post("/api/experiment/context/reload")
async def reload_experiment_context():
    ctx = reload_context()
    return {"context": ctx, "file_count": get_context_file_count()}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    check_config()
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
