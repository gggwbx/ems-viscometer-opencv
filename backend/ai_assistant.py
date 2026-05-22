import json
from typing import AsyncGenerator
from openai import AsyncOpenAI
from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, get_experiment_context


def get_client():
    if not LLM_API_KEY:
        return None, None
    return AsyncOpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL), LLM_MODEL


SYSTEM_PROMPT_BASE = """你是一个专业的物理实验助手，专注于抗磁悬浮电磁旋转粘度计实验。
请用中文回答问题，保持专业、准确、清晰。"""


def build_system_prompt(extra_context: str = "") -> str:
    system = SYSTEM_PROMPT_BASE
    exp_ctx = get_experiment_context()
    if exp_ctx:
        system += f"\n\n实验背景知识：\n{exp_ctx}"
    if extra_context:
        system += f"\n\n用户补充上下文：\n{extra_context}"
    return system


async def chat_stream(
    messages: list[dict],
    experiment_context: str = "",
) -> AsyncGenerator[str, None]:
    client, model = get_client()
    if client is None:
        yield "data: " + json.dumps({"error": "AI API 未配置，请在 backend/config.py 中设置 LLM_API_KEY"}) + "\n\n"
        yield "data: [DONE]\n\n"
        return

    system_content = build_system_prompt(experiment_context)
    full_messages = [{"role": "system", "content": system_content}] + messages

    stream = await client.chat.completions.create(
        model=model,
        messages=full_messages,
        stream=True,
        temperature=0.7,
        max_tokens=4096,
    )

    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            content = chunk.choices[0].delta.content
            yield "data: " + json.dumps({"content": content}, ensure_ascii=False) + "\n\n"

    yield "data: [DONE]\n\n"


async def analyze_data(
    data: str,
    question: str,
    experiment_context: str = "",
) -> AsyncGenerator[str, None]:
    client, model = get_client()
    if client is None:
        yield "data: " + json.dumps({"error": "AI API 未配置，请在 backend/config.py 中设置 LLM_API_KEY"}) + "\n\n"
        yield "data: [DONE]\n\n"
        return

    system_content = build_system_prompt(experiment_context)
    system_content += "\n你擅长分析实验数据，识别趋势、异常点和合适的拟合模型。"

    full_messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": f"实验数据如下：\n{data}\n\n用户问题：{question}\n\n请分析数据并回答。"}
    ]

    stream = await client.chat.completions.create(
        model=model,
        messages=full_messages,
        stream=True,
        temperature=0.5,
        max_tokens=4096,
    )

    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            content = chunk.choices[0].delta.content
            yield "data: " + json.dumps({"content": content}, ensure_ascii=False) + "\n\n"

    yield "data: [DONE]\n\n"
