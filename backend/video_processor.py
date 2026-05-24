import os
import uuid
import threading
from typing import Optional

from rpm_tracker_core import process_video, extract_first_frame, get_video_info, render_annotated_frame, fit_rpm_smooth

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
RESULTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "results")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

tasks: dict = {}
task_lock = threading.Lock()

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def save_upload(file_bytes: bytes, filename: str) -> dict:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file format: {ext}")

    video_id = uuid.uuid4().hex[:12]
    save_path = os.path.join(UPLOAD_DIR, f"{video_id}{ext}")

    with open(save_path, "wb") as f:
        f.write(file_bytes)

    info = get_video_info(save_path)
    if info is None:
        os.remove(save_path)
        raise ValueError("Failed to read video file")

    first_frame_dir = os.path.join(UPLOAD_DIR, "frames")
    os.makedirs(first_frame_dir, exist_ok=True)
    first_frame_path = os.path.join(first_frame_dir, f"{video_id}.jpg")
    dims = extract_first_frame(save_path, first_frame_path)

    return {
        "video_id": video_id,
        "filename": filename,
        "save_path": save_path,
        "first_frame_path": first_frame_path,
        "duration": info["duration"],
        "fps": info["fps"],
        "total_frames": info["total_frames"],
        "width": dims[0] if dims else 0,
        "height": dims[1] if dims else 0,
    }


def set_roi(video_id: str, x: int, y: int, a: int, b: int):
    with task_lock:
        if video_id not in tasks:
            tasks[video_id] = {}
        tasks[video_id]["roi"] = {"x": x, "y": y, "a": a, "b": b}


def get_roi(video_id: str) -> Optional[dict]:
    with task_lock:
        return tasks.get(video_id, {}).get("roi")


def start_tracking(video_id: str) -> str:
    task_id = uuid.uuid4().hex[:8]

    roi = get_roi(video_id)
    if roi is None:
        raise ValueError("ROI not set for this video")

    with task_lock:
        if video_id not in tasks:
            tasks[video_id] = {}
        tasks[video_id]["tracking"] = {
            "task_id": task_id,
            "status": "running",
            "progress": 0,
            "current_frame": 0,
            "total_frames": 0,
            "current_rpm": 0,
            "current_angle": 0,
            "elapsed_time": 0,
            "current_frame_jpg": None,
            "results": [],
        }

    video_path = find_video(video_id)
    if video_path is None:
        raise ValueError("Video file not found")

    output_dir = os.path.join(RESULTS_DIR, task_id)
    os.makedirs(output_dir, exist_ok=True)
    output_csv = os.path.join(output_dir, "rpm_data.csv")

    def run():
        for frame_data, raw_frame in process_video(
            video_path,
            center=(roi["x"], roi["y"]),
            a=roi["a"],
            b=roi["b"],
            output_csv=output_csv,
        ):
            if "error" in frame_data:
                with task_lock:
                    tasks[video_id]["tracking"]["status"] = "error"
                    tasks[video_id]["tracking"]["error"] = frame_data["error"]
                return

            with task_lock:
                t = tasks[video_id]["tracking"]
                if "done" in frame_data:
                    t["status"] = "completed"
                    t["progress"] = 100
                    t["summary"] = frame_data["summary"]
                    t["current_frame_jpg"] = None
                    # 跟踪完成后自动做 RPM 多项式拟合
                    if os.path.exists(output_csv):
                        try:
                            fit_result = fit_rpm_smooth(output_csv)
                            if fit_result:
                                t["rpm_fit"] = fit_result
                        except Exception:
                            pass
                else:
                    t["progress"] = frame_data["progress"]
                    t["current_frame"] = frame_data["frame"]
                    t["total_frames"] = frame_data["total_frames"]
                    t["current_rpm"] = frame_data["rpm_smooth"]
                    t["current_angle"] = frame_data["angle_deg"]
                    t["elapsed_time"] = frame_data["time_s"]

                    if raw_frame is not None:
                        jpg = render_annotated_frame(
                            raw_frame,
                            center=(roi["x"], roi["y"]),
                            a=roi["a"], b=roi["b"],
                            angle=frame_data["angle_deg"],
                            rpm_smooth=frame_data["rpm_smooth"],
                            rpm_cross=frame_data["rpm_cross"],
                            confidence=frame_data["confidence"],
                            frame_idx=frame_data["frame"],
                            total_frames=frame_data["total_frames"],
                            smooth_window=50,
                        )
                        t["current_frame_jpg"] = jpg

    thread = threading.Thread(target=run, daemon=True)
    thread.start()

    with task_lock:
        tasks[video_id]["tracking"]["thread"] = thread

    return task_id


def get_track_status(video_id: str, task_id: str) -> Optional[dict]:
    with task_lock:
        t = tasks.get(video_id, {}).get("tracking")
        if t is None or t["task_id"] != task_id:
            return None
        return {
            "task_id": task_id,
            "status": t["status"],
            "progress": t["progress"],
            "current_frame": t["current_frame"],
            "total_frames": t["total_frames"],
            "current_rpm": t["current_rpm"],
            "current_angle": t["current_angle"],
            "elapsed_time": t["elapsed_time"],
            "error": t.get("error"),
        }


def get_track_result(task_id: str) -> Optional[dict]:
    output_dir = os.path.join(RESULTS_DIR, task_id)
    csv_path = os.path.join(output_dir, "rpm_data.csv")
    if not os.path.exists(csv_path):
        return None

    for vid, vtasks in tasks.items():
        t = vtasks.get("tracking", {})
        if t.get("task_id") == task_id:
            return {
                "task_id": task_id,
                "csv_path": csv_path,
                "summary": t.get("summary", {}),
                "rpm_fit": t.get("rpm_fit"),
            }

    return {"task_id": task_id, "csv_path": csv_path, "summary": {}, "rpm_fit": None}


def find_video(video_id: str) -> Optional[str]:
    for ext in ALLOWED_EXTENSIONS:
        path = os.path.join(UPLOAD_DIR, f"{video_id}{ext}")
        if os.path.exists(path):
            return path
    return None


def find_first_frame(video_id: str) -> Optional[str]:
    path = os.path.join(UPLOAD_DIR, "frames", f"{video_id}.jpg")
    return path if os.path.exists(path) else None


def cleanup_video(video_id: str) -> dict:
    deleted = {"video": False, "frame": False, "results": 0}
    with task_lock:
        vtasks = tasks.pop(video_id, {})

    video_path = find_video(video_id)
    if video_path and os.path.exists(video_path):
        os.remove(video_path)
        deleted["video"] = True

    frame_path = find_first_frame(video_id)
    if frame_path and os.path.exists(frame_path):
        os.remove(frame_path)
        deleted["frame"] = True

    tracking = vtasks.get("tracking", {})
    task_id = tracking.get("task_id")
    if task_id:
        result_dir = os.path.join(RESULTS_DIR, task_id)
        if os.path.isdir(result_dir):
            import shutil
            shutil.rmtree(result_dir, ignore_errors=True)
            deleted["results"] = 1

    return deleted


def clear_all_uploads() -> dict:
    import shutil
    deleted = {"videos": 0, "frames": 0, "results": 0}

    with task_lock:
        tasks.clear()

    for f in os.listdir(UPLOAD_DIR):
        fp = os.path.join(UPLOAD_DIR, f)
        if os.path.isfile(fp):
            os.remove(fp)
            deleted["videos"] += 1

    frames_dir = os.path.join(UPLOAD_DIR, "frames")
    if os.path.isdir(frames_dir):
        for f in os.listdir(frames_dir):
            fp = os.path.join(frames_dir, f)
            if os.path.isfile(fp):
                os.remove(fp)
                deleted["frames"] += 1

    if os.path.isdir(RESULTS_DIR):
        for d in os.listdir(RESULTS_DIR):
            dp = os.path.join(RESULTS_DIR, d)
            if os.path.isdir(dp):
                shutil.rmtree(dp, ignore_errors=True)
                deleted["results"] += 1

    return deleted


def get_tracking_frame_jpg(task_id: str) -> Optional[bytes]:
    """返回跟踪任务的当前标注帧 JPEG 字节"""
    with task_lock:
        for video_id, vtasks in tasks.items():
            t = vtasks.get("tracking", {})
            if t.get("task_id") == task_id:
                return t.get("current_frame_jpg")
    return None
