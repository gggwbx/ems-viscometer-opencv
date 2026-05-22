import cv2
import numpy as np
import time
from collections import deque
import csv

# ========== 配置参数 ==========
VIDEO_PATH = "your_video.mp4"
USE_CAMERA = False
CAMERA_ID = 0
NUM_ANGULAR = 360
NUM_RADIAL = 120
RADIAL_MIN_FRAC = 0.35
RADIAL_MAX_FRAC = 0.90
SAVE_LOG = True
LOG_PATH = "1846.csv"
SHOW_POLAR = True
DISPLAY_HEIGHT = 720
# =================================


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
    def __init__(self, video_path=None, use_camera=False, camera_id=0):
        self.video_path = video_path
        self.use_camera = use_camera
        self.camera_id = camera_id

        self.center = None
        self.a = None
        self.b = None
        self.map_x = None
        self.map_y = None

        self.rpm_smooth = 0.0          # 一圈滑动平均 RPM
        self.rpm_crossing = 0.0        # 过零检测 RPM
        self.rpm_history = deque()     # 累积到一整圈长度
        self.smooth_window = 50        # 初值，启动后根据实测转速动态调整

        self.angle_history = deque(maxlen=4)
        self.last_angle = None
        self.last_cross_time = None
        self.revolutions = 0

        self.csv_file = None
        self.csv_writer = None

    # ---------- 椭圆极坐标映射 ----------
    def build_polar_map(self, shape):
        cx, cy = self.center
        a, b = self.a, self.b

        angles = np.linspace(0, 2 * np.pi, NUM_ANGULAR, endpoint=False, dtype=np.float32)
        fracs = np.linspace(0, 1, NUM_RADIAL, dtype=np.float32)

        F, A = np.meshgrid(fracs, angles, indexing="ij")

        self.map_x = (cx + F * a * np.cos(A)).astype(np.float32)
        self.map_y = (cy + F * b * np.sin(A)).astype(np.float32)

    # ---------- 手动矩形 ROI ----------
    @staticmethod
    def select_roi(first_frame):
        rect = None
        drawing = False
        start_pt = (0, 0)
        temp_pt = (0, 0)

        def mouse_cb(event, x, y, flags, param):
            nonlocal rect, drawing, start_pt, temp_pt
            if event == cv2.EVENT_LBUTTONDOWN:
                drawing = True
                start_pt = (x, y)
            elif event == cv2.EVENT_MOUSEMOVE and drawing:
                temp_pt = (x, y)
            elif event == cv2.EVENT_LBUTTONUP:
                drawing = False
                x1, y1 = start_pt
                w = x - x1
                h = y - y1
                if abs(w) > 10 and abs(h) > 10:
                    if w < 0:
                        x1 += w
                        w = -w
                    if h < 0:
                        y1 += h
                        h = -h
                    rect = (x1, y1, w, h)

        cv2.namedWindow("Select Disk Region", cv2.WINDOW_NORMAL)
        cv2.setMouseCallback("Select Disk Region", mouse_cb)

        print("拖拽框选椭圆磁盘区域，按 ENTER 确认，按 ESC 退出")

        while True:
            disp = first_frame.copy()
            cv2.putText(disp, "Drag to select elliptical disk. ENTER=confirm, ESC=quit",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            if drawing:
                x1, y1 = start_pt
                cv2.rectangle(disp, (x1, y1), temp_pt, (0, 255, 0), 2)
            elif rect is not None:
                x, y, w, h = rect
                cv2.rectangle(disp, (x, y), (x + w, y + h), (255, 0, 0), 2)
                cx = x + w // 2
                cy = y + h // 2
                cv2.circle(disp, (cx, cy), 5, (0, 0, 255), -1)
                cv2.ellipse(disp, (cx, cy), (w // 2, h // 2), 0, 0, 360, (0, 255, 255), 2)
                cv2.putText(disp, f"Center:({cx},{cy})  a={w//2} b={h//2}",
                            (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 1)
            cv2.imshow("Select Disk Region", disp)

            key = cv2.waitKey(30) & 0xFF
            if key == 13 and rect is not None:
                break
            elif key == 27:
                rect = None
                break

        cv2.destroyWindow("Select Disk Region")

        if rect is None:
            return None, None, None

        x, y, w, h = rect
        center = (x + w // 2, y + h // 2)
        a = w // 2
        b = h // 2
        print(f"框选区域: {rect}  中心: {center}  半轴: a={a}, b={b}")
        return center, a, b

    # ---------- 找黑线角度（亚像素） ----------
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

        return angle, confidence, col_avg_smooth

    # ---------- 动态计算平滑窗口大小 ----------
    def _update_smooth_window(self, rpm, fps):
        """根据当前转速动态设定滑动平均窗口 = 一整圈的帧数"""
        if abs(rpm) < 1:
            return
        period_s = 60.0 / abs(rpm)
        window = int(period_s * fps)
        window = max(10, min(window, 200))  # 10~200 帧范围
        self.smooth_window = window

    # ---------- 更新 RPM ----------
    def update_rpm(self, angle, video_time, confidence, fps):
        # 低置信度：用速度预测
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

        # ── 帧间瞬时 RPM ──
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

        # ── 一整圈滑动平均 RPM ──
        if rpm_instant != 0:
            self.rpm_history.append(rpm_instant)

        # 动态调整窗口长度
        self._update_smooth_window(self.rpm_smooth, fps)

        # 保留最近 smooth_window 个值
        while len(self.rpm_history) > self.smooth_window:
            self.rpm_history.popleft()

        self.rpm_smooth = float(np.mean(list(self.rpm_history))) if self.rpm_history else 0.0

        # ── 过零检测 RPM ──
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

    # ---------- 日志 ----------
    def _init_log(self):
        if SAVE_LOG:
            self.csv_file = open(LOG_PATH, "w", newline="", encoding="utf-8")
            self.csv_writer = csv.writer(self.csv_file)
            self.csv_writer.writerow(["frame", "time_s", "angle_deg",
                                       "rpm_smooth", "rpm_cross", "confidence"])

    def _write_log(self, frame_idx, t, angle, rpm_s, rpm_x, conf):
        if self.csv_writer:
            self.csv_writer.writerow([frame_idx, f"{t:.4f}", f"{angle:.2f}",
                                       f"{rpm_s:.2f}", f"{rpm_x:.2f}", f"{conf:.4f}"])

    def _close_log(self):
        if self.csv_file:
            self.csv_file.close()
            print(f"数据已保存到 {LOG_PATH}")

    # ---------- 主循环 ----------
    def run(self):
        cap = cv2.VideoCapture(self.camera_id if self.use_camera else self.video_path)
        if not cap.isOpened():
            print("无法打开视频源")
            return

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 60.0
            print(f"无法获取帧率，默认 {fps} FPS")
        else:
            print(f"视频帧率: {fps:.2f} FPS")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        print(f"总帧数: {total_frames}")

        ret, first_frame = cap.read()
        if not ret:
            print("读取第一帧失败")
            cap.release()
            return

        self.center, self.a, self.b = self.select_roi(first_frame)
        if self.center is None:
            print("未选择区域，退出")
            cap.release()
            return

        self.build_polar_map(first_frame.shape[:2])

        self._init_log()

        cv2.namedWindow("RPM Tracker", cv2.WINDOW_NORMAL)
        if SHOW_POLAR:
            cv2.namedWindow("Polar Transform", cv2.WINDOW_NORMAL)

        frame_idx = 0
        print("逐帧处理中，按 ESC 退出，按 R 重新框选...")

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_idx += 1

            video_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if video_ms > 0:
                video_time = video_ms / 1000.0
            else:
                video_time = frame_idx / fps

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            polar = cv2.remap(gray, self.map_x, self.map_y, cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_CONSTANT, borderValue=255)

            angle, confidence, signal = self.find_line_angle(polar)
            self.update_rpm(angle, video_time, confidence, fps)
            self._write_log(frame_idx, video_time, angle,
                            self.rpm_smooth, self.rpm_crossing, confidence)

            # ── 可视化 ──
            cx, cy = self.center

            if DISPLAY_HEIGHT > 0 and DISPLAY_HEIGHT < frame.shape[0]:
                scale = DISPLAY_HEIGHT / frame.shape[0]
                disp = cv2.resize(frame, (int(frame.shape[1] * scale), DISPLAY_HEIGHT))
                sc = scale
            else:
                disp = frame.copy()
                sc = 1.0

            cv2.ellipse(disp, (int(cx * sc), int(cy * sc)),
                        (int(self.a * sc), int(self.b * sc)), 0, 0, 360, (0, 255, 0), 2)
            cv2.circle(disp, (int(cx * sc), int(cy * sc)), 5, (0, 0, 255), -1)

            cv2.ellipse(disp, (int(cx * sc), int(cy * sc)),
                        (int(self.a * RADIAL_MIN_FRAC * sc), int(self.b * RADIAL_MIN_FRAC * sc)),
                        0, 0, 360, (128, 128, 128), 1)
            cv2.ellipse(disp, (int(cx * sc), int(cy * sc)),
                        (int(self.a * RADIAL_MAX_FRAC * sc), int(self.b * RADIAL_MAX_FRAC * sc)),
                        0, 0, 360, (128, 128, 128), 1)

            angle_rad = np.deg2rad(angle)
            lx = int((cx + self.a * np.cos(angle_rad)) * sc)
            ly = int((cy + self.b * np.sin(angle_rad)) * sc)
            cv2.line(disp, (int(cx * sc), int(cy * sc)), (lx, ly), (0, 255, 255), 2)

            cv2.putText(disp, f"RPM(avg): {self.rpm_smooth:7.1f}  (win={self.smooth_window})",
                        (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
            cv2.putText(disp, f"RPM(cross):{self.rpm_crossing:7.1f}",
                        (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 128), 2)
            cv2.putText(disp, f"Angle: {angle:6.1f} deg  Conf: {confidence:.3f}",
                        (20, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            progress = frame_idx / total_frames * 100 if total_frames > 0 else 0
            cv2.putText(disp, f"Frame: {frame_idx}/{total_frames} ({progress:.0f}%)  "
                              f"Revs: {self.revolutions}  T: {video_time:.1f}s",
                        (20, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            status = "TRACKING" if confidence > 0.10 else "LOW CONF"
            sc_color = (0, 255, 0) if confidence > 0.10 else (0, 0, 255)
            cv2.putText(disp, status, (20, 170),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, sc_color, 2)

            cv2.imshow("RPM Tracker", disp)

            if SHOW_POLAR:
                polar_disp = cv2.cvtColor(polar, cv2.COLOR_GRAY2BGR)
                r_min_v = int(NUM_RADIAL * RADIAL_MIN_FRAC)
                r_max_v = int(NUM_RADIAL * RADIAL_MAX_FRAC)
                cv2.line(polar_disp, (0, r_min_v), (NUM_ANGULAR - 1, r_min_v), (255, 255, 0), 1)
                cv2.line(polar_disp, (0, r_max_v), (NUM_ANGULAR - 1, r_max_v), (255, 255, 0), 1)
                col_idx = int(angle * NUM_ANGULAR / 360) % NUM_ANGULAR
                cv2.line(polar_disp, (col_idx, 0), (col_idx, NUM_RADIAL - 1), (0, 0, 255), 2)

                sig_h = 60
                sig_canvas = np.zeros((sig_h, NUM_ANGULAR, 3), dtype=np.uint8)
                if signal is not None:
                    sig_norm = signal.copy()
                    s_min, s_max = sig_norm.min(), sig_norm.max()
                    if s_max > s_min:
                        sig_norm = (sig_norm - s_min) / (s_max - s_min) * sig_h
                    for i in range(NUM_ANGULAR - 1):
                        pt1 = (i, sig_h - int(sig_norm[i]))
                        pt2 = (i + 1, sig_h - int(sig_norm[i + 1]))
                        cv2.line(sig_canvas, pt1, pt2, (0, 255, 0), 1)
                polar_combined = np.vstack([polar_disp, sig_canvas])
                cv2.imshow("Polar Transform", polar_combined)

            key = cv2.waitKey(1) & 0xFF
            if key == 27:
                break
            elif key == ord("r"):
                print("重新框选磁盘区域...")
                self.center, self.a, self.b = self.select_roi(frame)
                if self.center and self.a and self.b:
                    self.build_polar_map(frame.shape[:2])
                    self.angle_history.clear()
                    self.rpm_history.clear()
                    self.last_angle = None
                    self.last_cross_time = None
                    self.revolutions = 0

        cap.release()
        cv2.destroyAllWindows()
        self._close_log()

        if self.rpm_history:
            vals = list(self.rpm_history)
            print(f"\n测量完成")
            print(f"  总转数: {self.revolutions}")
            print(f"  平均 RPM: {np.mean(vals):.2f}")
            print(f"  最大 RPM: {np.max(vals):.2f}")
            print(f"  最小 RPM: {np.min(vals):.2f}")
            print(f"  标准差:   {np.std(vals):.2f}")


if __name__ == "__main__":
    if USE_CAMERA:
        meter = DiskRPMMeter(use_camera=True, camera_id=CAMERA_ID)
    else:
        meter = DiskRPMMeter(video_path=VIDEO_PATH)
    meter.run()
