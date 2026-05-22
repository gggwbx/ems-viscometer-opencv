import cv2
import numpy as np
from collections import deque
import csv
import os
from typing import Generator, Optional

NUM_ANGULAR = 360
NUM_RADIAL = 120
RADIAL_MIN_FRAC = 0.35
RADIAL_MAX_FRAC = 0.90


def _circular_gaussian_smooth(signal, sigma=3.0, half=4):
    signal = np.asarray(signal, dtype=np.float64)
    x = np.arange(-half, half + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    kernel /= kernel.sum()
    n = len(signal)
    padded = np.concatenate([signal[-half:], signal, signal[:half]])
    smoothed = np.convolve(padded, kernel, mode="valid")
    return smoothed[:n]


def _parabolic_refine(values, idx, n):
    left = values[(idx - 1) % n]
    center = values[idx]
    right = values[(idx + 1) % n]
    denom = 2.0 * (left + right - 2.0 * center)
    if abs(denom) > 1e-10:
        offset = (left - right) / denom
        offset = max(-0.5, min(0.5, offset))
    else:
        offset = 0.0
    return offset


class DiskRPMMeter:
    def __init__(self):
        self.center = None
        self.a = None
        self.b = None
        self.map_x = None
        self.map_y = None
        self.rpm_smooth = 0.0
        self.rpm_crossing = 0.0
        self.rpm_history = deque()
        self.smooth_window = 50
        self.angle_history = deque(maxlen=4)
        self.last_angle = None
        self.last_cross_time = None
        self.revolutions = 0

    def setup(self, center, a, b, frame_shape):
        self.center = center
        self.a = a
        self.b = b
        self.build_polar_map(frame_shape)

    def build_polar_map(self, shape):
        cx, cy = self.center
        a, b = self.a, self.b
        angles = np.linspace(0, 2 * np.pi, NUM_ANGULAR, endpoint=False, dtype=np.float32)
        fracs = np.linspace(0, 1, NUM_RADIAL, dtype=np.float32)
        F, A = np.meshgrid(fracs, angles, indexing="ij")
        self.map_x = (cx + F * a * np.cos(A)).astype(np.float32)
        self.map_y = (cy + F * b * np.sin(A)).astype(np.float32)

    def find_line_angle(self, polar_gray):
        r_min = int(NUM_RADIAL * RADIAL_MIN_FRAC)
        r_max = int(NUM_RADIAL * RADIAL_MAX_FRAC)
        roi = polar_gray[r_min:r_max, :]
        col_avg = np.mean(roi, axis=0).astype(np.float64)
        col_avg_smooth = _circular_gaussian_smooth(col_avg, sigma=3.0, half=4)
        min_idx = int(np.argmin(col_avg_smooth))
        offset = _parabolic_refine(col_avg_smooth, min_idx, NUM_ANGULAR)
        angle = ((min_idx + offset) * 360.0 / NUM_ANGULAR) % 360.0
        median_val = float(np.median(col_avg))
        min_val = float(col_avg_smooth[min_idx])
        confidence = (median_val - min_val) / (median_val + 1e-6)
        return angle, confidence

    def _update_smooth_window(self, rpm, fps):
        if abs(rpm) < 1:
            return
        period_s = 60.0 / abs(rpm)
        window = int(period_s * fps)
        window = max(10, min(window, 200))
        self.smooth_window = window

    def update_rpm(self, angle, video_time, confidence, fps):
        used_angle = angle
        if confidence < 0.10 and self.last_angle is not None:
            if len(self.angle_history) >= 2:
                a1, t1 = self.angle_history[-2]
                a2, t2 = self.angle_history[-1]
                dt12 = t2 - t1
                if dt12 > 0:
                    da = a2 - a1
                    if da > 180:
                        da -= 360
                    elif da < -180:
                        da += 360
                    vel = da / dt12
                    used_angle = (a2 + vel * (video_time - t2)) % 360.0
                else:
                    used_angle = self.last_angle
            else:
                used_angle = self.last_angle

        self.angle_history.append((used_angle, video_time))

        rpm_instant = 0.0
        if len(self.angle_history) >= 2:
            a_prev, t_prev = self.angle_history[-2]
            a_curr, t_curr = self.angle_history[-1]
            delta = a_curr - a_prev
            if delta > 180:
                delta -= 360
            elif delta < -180:
                delta += 360
            dt = t_curr - t_prev
            if dt > 0:
                rpm_instant = (delta / 360.0) * (60.0 / dt)

        if rpm_instant != 0:
            self.rpm_history.append(rpm_instant)

        self._update_smooth_window(self.rpm_smooth, fps)
        while len(self.rpm_history) > self.smooth_window:
            self.rpm_history.popleft()

        self.rpm_smooth = float(np.mean(list(self.rpm_history))) if self.rpm_history else 0.0

        if self.last_angle is not None:
            if self.last_angle > 270 and angle < 90:
                self.revolutions += 1
                if self.last_cross_time is not None:
                    period = video_time - self.last_cross_time
                    if period > 0.005:
                        self.rpm_crossing = 60.0 / period
                self.last_cross_time = video_time
            elif self.last_angle < 90 and angle > 270:
                self.revolutions += 1
                if self.last_cross_time is not None:
                    period = video_time - self.last_cross_time
                    if period > 0.005:
                        self.rpm_crossing = -60.0 / period
                self.last_cross_time = video_time

        self.last_angle = angle

    def reset(self):
        self.rpm_smooth = 0.0
        self.rpm_crossing = 0.0
        self.rpm_history.clear()
        self.smooth_window = 50
        self.angle_history.clear()
        self.last_angle = None
        self.last_cross_time = None
        self.revolutions = 0


def process_video(
    video_path: str,
    center: tuple,
    a: int,
    b: int,
    output_csv: Optional[str] = None,
) -> Generator[dict, None, None]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        yield {"error": f"Cannot open video: {video_path}"}
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 60.0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    ret, first_frame = cap.read()
    if not ret:
        cap.release()
        yield {"error": "Failed to read first frame"}
        return

    meter = DiskRPMMeter()
    meter.setup(center, a, b, first_frame.shape[:2])

    csv_file = None
    csv_writer = None
    if output_csv:
        os.makedirs(os.path.dirname(output_csv), exist_ok=True)
        csv_file = open(output_csv, "w", newline="", encoding="utf-8")
        csv_writer = csv.writer(csv_file)
        csv_writer.writerow(["frame", "time_s", "angle_deg", "rpm_smooth", "rpm_cross", "confidence"])

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        video_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
        video_time = video_ms / 1000.0 if video_ms > 0 else frame_idx / fps

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        polar = cv2.remap(gray, meter.map_x, meter.map_y, cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=255)
        angle, confidence = meter.find_line_angle(polar)
        meter.update_rpm(angle, video_time, confidence, fps)

        if csv_writer:
            csv_writer.writerow([frame_idx, f"{video_time:.4f}", f"{angle:.2f}",
                                  f"{meter.rpm_smooth:.2f}", f"{meter.rpm_crossing:.2f}", f"{confidence:.4f}"])

        yield {
            "frame": frame_idx,
            "time_s": round(video_time, 4),
            "angle_deg": round(angle, 2),
            "rpm_smooth": round(meter.rpm_smooth, 2),
            "rpm_cross": round(meter.rpm_crossing, 2),
            "confidence": round(confidence, 4),
            "progress": round(frame_idx / total_frames * 100, 1) if total_frames > 0 else 0,
            "total_frames": total_frames,
        }, frame

    cap.release()
    if csv_file:
        csv_file.close()

    rpm_vals = list(meter.rpm_history)
    if rpm_vals:
        yield {
            "frame": frame_idx,
            "done": True,
            "summary": {
                "total_revolutions": meter.revolutions,
                "avg_rpm": round(float(np.mean(rpm_vals)), 2),
                "max_rpm": round(float(np.max(rpm_vals)), 2),
                "min_rpm": round(float(np.min(rpm_vals)), 2),
                "std_rpm": round(float(np.std(rpm_vals)), 2),
            }
        }, None


def extract_first_frame(video_path: str, output_path: str) -> Optional[tuple]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    ret, frame = cap.read()
    if not ret:
        cap.release()
        return None

    h, w = frame.shape[:2]
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, frame)
    cap.release()
    return (w, h)


def get_video_info(video_path: str) -> Optional[dict]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    cap.release()
    return {
        "fps": round(fps, 2),
        "total_frames": total_frames,
        "duration": round(duration, 2),
    }


def render_annotated_frame(frame, center, a, b, angle, rpm_smooth, rpm_cross,
                          confidence, frame_idx, total_frames, smooth_window,
                          display_height=480):
    """在帧上绘制标注（椭圆、角度线、文字），返回 JPEG 字节"""
    cx, cy = center

    if display_height > 0 and display_height < frame.shape[0]:
        scale = display_height / frame.shape[0]
        disp = cv2.resize(frame, (int(frame.shape[1] * scale), display_height))
        sc = scale
    else:
        disp = frame.copy()
        sc = 1.0

    # 绿色椭圆 ROI
    cv2.ellipse(disp, (int(cx * sc), int(cy * sc)),
                (int(a * sc), int(b * sc)), 0, 0, 360, (0, 255, 0), 2)
    # 红色中心点
    cv2.circle(disp, (int(cx * sc), int(cy * sc)), 5, (0, 0, 255), -1)
    # 径向范围圈
    cv2.ellipse(disp, (int(cx * sc), int(cy * sc)),
                (int(a * RADIAL_MIN_FRAC * sc), int(b * RADIAL_MIN_FRAC * sc)),
                0, 0, 360, (128, 128, 128), 1)
    cv2.ellipse(disp, (int(cx * sc), int(cy * sc)),
                (int(a * RADIAL_MAX_FRAC * sc), int(b * RADIAL_MAX_FRAC * sc)),
                0, 0, 360, (128, 128, 128), 1)
    # 黄色角度指示线
    angle_rad = np.deg2rad(angle)
    lx = int((cx + a * np.cos(angle_rad)) * sc)
    ly = int((cy + b * np.sin(angle_rad)) * sc)
    cv2.line(disp, (int(cx * sc), int(cy * sc)), (lx, ly), (0, 255, 255), 2)

    # 文字覆盖
    cv2.putText(disp, f"RPM(avg): {rpm_smooth:7.1f}  (win={smooth_window})",
                (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
    cv2.putText(disp, f"RPM(cross):{rpm_cross:7.1f}",
                (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 128), 2)
    cv2.putText(disp, f"Angle: {angle:6.1f} deg  Conf: {confidence:.3f}",
                (10, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1)
    progress = frame_idx / total_frames * 100 if total_frames > 0 else 0
    cv2.putText(disp, f"Frame: {frame_idx}/{total_frames} ({progress:.0f}%)",
                (10, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
    status = "TRACKING" if confidence > 0.10 else "LOW CONF"
    sc_color = (0, 255, 0) if confidence > 0.10 else (0, 0, 255)
    cv2.putText(disp, status, (10, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.5, sc_color, 2)

    _, buf = cv2.imencode(".jpg", disp, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return buf.tobytes()


def render_tracking_frame(video_path: str, frame_idx: int, center: tuple, a: int, b: int,
                          angle: float, rpm_smooth: float, rpm_cross: float,
                          confidence: float, total_frames: int,
                          display_height: int = 360) -> Optional[bytes]:
    """渲染跟踪帧（备份方法：打开视频 seek 到指定帧）"""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        return None
    return render_annotated_frame(frame, center, a, b, angle, rpm_smooth, rpm_cross,
                                  confidence, frame_idx, total_frames, 50, display_height)


def fit_rpm_smooth(csv_path: str, poly_degree: int = 5) -> Optional[dict]:
    """
    稳健拟合 RPM 时序数据：
    1. 用 MAD（中位数绝对偏差）滤掉极端异常点
    2. 对保留的点做多项式拟合
    3. 用拟合值替换异常点
    """
    import csv as csv_module
    times = []
    rpms = []

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv_module.DictReader(f)
        for row in reader:
            times.append(float(row["time_s"]))
            rpms.append(float(row["rpm_smooth"]))

    if len(times) < poly_degree + 1:
        return None

    t_arr = np.array(times, dtype=np.float64)
    r_arr = np.array(rpms, dtype=np.float64)

    # Step 1: 用 MAD 滤极端异常值（绝对值超过 10*MAD 的点标记为无效）
    median = np.median(r_arr)
    mad = np.median(np.abs(r_arr - median))
    if mad < 1e-6:
        mad = 1.0
    valid = np.abs(r_arr - median) < 10.0 * mad
    extreme_count = int(np.sum(~valid))

    t_clean = t_arr[valid]
    r_clean = r_arr[valid]

    # Step 2: 对清洗后的数据做多项式拟合
    if len(t_clean) < poly_degree + 1:
        return None

    coeffs = np.polyfit(t_clean, r_clean, poly_degree)
    fitted = np.polyval(coeffs, t_arr)

    # Step 3: 计算残差，标记正常异常点（偏离拟合值超过 2 倍标准差）
    residuals = np.abs(r_arr - fitted)
    # 只对非极端点计算标准差
    clean_residuals = residuals[valid]
    if len(clean_residuals) == 0:
        return None
    threshold = 2.0 * np.std(clean_residuals)
    if threshold < 1.0:
        threshold = 1.0

    outlier_mask = residuals > threshold
    outlier_mask = outlier_mask | (~valid)  # 极端异常点也替换
    corrected = r_arr.copy()
    for i in range(len(corrected)):
        if outlier_mask[i]:
            corrected[i] = fitted[i]

    return {
        "fitted_rpm": [round(v, 2) for v in fitted.tolist()],
        "corrected_rpm": [round(v, 2) for v in corrected.tolist()],
        "poly_coeffs": [round(c, 6) for c in coeffs.tolist()],
        "time_s": [round(t, 4) for t in times],
        "outlier_count": int(np.sum(outlier_mask)),
        "extreme_outlier_count": extreme_count,
    }
