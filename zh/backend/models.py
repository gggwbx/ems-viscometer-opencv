from pydantic import BaseModel, Field
from typing import Optional, Literal


class UploadResponse(BaseModel):
    video_id: str
    filename: str
    duration: float
    fps: float
    total_frames: int
    first_frame_url: str


class RoiRequest(BaseModel):
    video_id: str
    x: int = Field(..., description="ROI center x")
    y: int = Field(..., description="ROI center y")
    a: int = Field(..., description="Semi-major axis")
    b: int = Field(..., description="Semi-minor axis")


class TrackStartResponse(BaseModel):
    task_id: str
    status: str


class TrackStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: float
    current_frame: int
    total_frames: int
    current_rpm: float
    current_angle: float
    elapsed_time: float


class TrackResultResponse(BaseModel):
    task_id: str
    csv_url: str
    summary: dict


class FitRequest(BaseModel):
    x: list[float]
    y: list[float]
    x_name: str = "x"
    x_unit: str = ""
    y_name: str = "y"
    y_unit: str = ""
    model: Literal["linear", "linear_zero", "quadratic", "exponential", "logarithmic", "reciprocal"] = "linear"


class FitParam(BaseModel):
    name: str
    value: float
    std_err: Optional[float] = None


class FitResponse(BaseModel):
    model: str
    formula: str
    formula_latex: str
    params: list[FitParam]
    r_squared: float
    rmse: float
    fit_x: list[float]
    fit_y: list[float]
    x_name: str
    x_unit: str
    y_name: str
    y_unit: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class AIChatRequest(BaseModel):
    messages: list[ChatMessage]
    experiment_context: str = ""


class AIAnalyzeRequest(BaseModel):
    data: str
    question: str
    experiment_context: str = ""
