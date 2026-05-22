# ============================================================
# EMS 粘度计数据分析平台 — 全局配置文件
# ============================================================

# ===== AI API 配置（兼容 OpenAI / DeepSeek / Kimi 等） =====
LLM_API_KEY = ""  # 填入你的 API Key
LLM_BASE_URL = "https://api.deepseek.com/v1"
LLM_MODEL = "deepseek-chat"

# ===== 实验上下文（自动从 上下文 目录加载） =====
# 支持 .md / .txt / .pdf / .docx，往目录里添加文件即可，无需改配置
# PDF 扫描件（纯图片）无法提取文字，请提供文字版 .md 或 .txt


def get_experiment_context() -> str:
    from context_loader import get_context
    return get_context()


def get_experiment_notes() -> str:
    from context_loader import get_notes
    return get_notes()


def reload_context() -> str:
    from context_loader import reload_context
    return reload_context()


def get_context_file_count() -> dict:
    from context_loader import get_context_file_count
    return get_context_file_count()


def check_config():
    from context_loader import CONTEXT_DIR
    if not LLM_API_KEY:
        print(f"[WARNING] LLM_API_KEY 未设置，AI 功能将不可用。请在 backend/config.py 中配置。")
    else:
        print(f"[INFO] AI API 已配置: {LLM_BASE_URL} / {LLM_MODEL}")
    count_info = get_context_file_count()
    print(f"[INFO] 实验上下文: {count_info['loaded']} 个文件已加载"
          f"{'（' + str(count_info['skipped']) + ' 个跳过）' if count_info['skipped'] else ''}"
          f" ({CONTEXT_DIR})")
