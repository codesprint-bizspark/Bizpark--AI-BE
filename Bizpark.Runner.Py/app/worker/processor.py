import logging
import uuid as uuid_lib
from urllib.parse import urlparse

import httpx
from bullmq import Worker
from sqlalchemy import select

from app.config import settings
from app.db.models import AgentTask, TaskStatus
from app.db.session import async_session
from app.agents.website_builder import run_website_builder
from app.agents.google_review_reply import run_google_review_reply_agent
from app.agents.social_content import run_social_content_agent
from app.agents.mobile_app_builder import run_mobile_app_builder

logger = logging.getLogger("runner.processor")


async def process_agent_task(job, token=None):
    job_data = job.data
    task_id = job_data["taskId"]
    business_id = job_data["businessId"]
    task_type = job_data["taskType"]
    input_data = job_data.get("inputData", {})
    usage_reservation_id = job_data.get("usageReservationId") or input_data.get("usageReservationId")

    logger.info(f"[AGENT START] Task {task_id} [{task_type}] for business {business_id}")

    async with async_session() as session:
        result = await session.execute(
            select(AgentTask).where(AgentTask.id == uuid_lib.UUID(task_id))
        )
        task = result.scalar_one_or_none()

        if task:
            task.status = TaskStatus.PROCESSING
            await session.commit()
        else:
            task = AgentTask(
                id=uuid_lib.UUID(task_id),
                businessId=business_id,
                taskType=task_type,
                status=TaskStatus.PROCESSING,
                inputData=input_data,
            )
            session.add(task)
            await session.commit()

        usage = None
        try:
            if task_type == "WEBSITE_GENERATION":
                output = await _handle_website_generation(input_data)
                task.status = TaskStatus.PENDING_APPROVAL
                task.outputData = output
                usage = _extract_usage(output)
            elif task_type == "MOBILE_APP_GENERATION":
                output = await _handle_mobile_app_generation(input_data)
                task.status = TaskStatus.PENDING_APPROVAL
                task.outputData = output
                usage = _extract_usage(output)
            elif task_type == "GOOGLE_REVIEW_REPLY":
                output = await _handle_google_review_reply(input_data)
                task.status = TaskStatus.COMPLETED
                task.outputData = output
                usage = _extract_usage(output)
            elif task_type == "SOCIAL_MEDIA_CONTENT":
                output = await run_social_content_agent(input_data, session)
                task.status = TaskStatus.COMPLETED
                task.outputData = output
                usage = _extract_usage(output)
            else:
                logger.warning(f"[AGENT] No handler for task type '{task_type}' — marking FAILED")
                task.status = TaskStatus.FAILED
                task.outputData = {"error": f"Task type '{task_type}' is not implemented"}

        except Exception as exc:
            logger.error(f"[AGENT ERROR] Task {task_id}: {exc}")
            task.status = TaskStatus.FAILED
            task.outputData = {"error": str(exc)}

        await session.commit()

    if usage_reservation_id:
        if task.status == TaskStatus.FAILED:
            await _report_usage(usage_reservation_id, "RELEASED", task_id=task_id)
        else:
            await _report_usage(usage_reservation_id, "COMMITTED", task_id=task_id, usage=usage)

    logger.info(f"[AGENT DONE] Task {task_id}: {task.status.value}")


async def _handle_website_generation(input_data: dict) -> dict:
    business = input_data.get("business", {})
    website_config = input_data.get("websiteConfig", {})
    cms_data = website_config.get("cmsData", {})
    tone = input_data.get("tone", "professional")

    generated, usage = await run_website_builder(
        business=business,
        raw_cms_data=cms_data,
        tone=tone,
    )

    return {
        "generatedContent": generated,
        "businessId": business.get("id"),
        "usage": usage,
    }


async def _handle_google_review_reply(input_data: dict) -> dict:
    business = input_data.get("business", {})
    review = input_data.get("review", {})
    policy = input_data.get("policy", {})

    return await run_google_review_reply_agent(
        business=business,
        review=review,
        policy=policy,
    )


async def _handle_mobile_app_generation(input_data: dict) -> dict:
    business = input_data.get("business", {})
    tone = input_data.get("tone", "professional")

    generated, usage = await run_mobile_app_builder(
        business=business,
        tone=tone,
    )

    return {
        "generatedContent": generated,
        "businessId": business.get("id"),
        "usage": usage,
    }


def _extract_usage(output: dict | None) -> dict | None:
    if isinstance(output, dict) and isinstance(output.get("usage"), dict):
        return output["usage"]
    return None


async def _report_usage(
    reservation_id: str,
    status: str,
    task_id: str,
    usage: dict | None = None,
) -> None:
    api_base = (settings.api_internal_url or settings.public_api_url or "http://localhost:3000").rstrip("/")
    usage = usage or {}
    payload = {
        "reservationId": reservation_id,
        "status": status,
        "promptTokens": usage.get("promptTokens"),
        "completionTokens": usage.get("completionTokens"),
        "totalTokens": usage.get("totalTokens"),
        "provider": usage.get("provider"),
        "model": usage.get("model"),
        "metadata": {"taskId": task_id, **(usage.get("metadata") or {})},
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{api_base}/api/internal/usage/commit",
                headers={
                    "Content-Type": "application/json",
                    "x-internal-key": settings.internal_api_key,
                },
                json=payload,
            )
            resp.raise_for_status()
    except Exception as exc:
        logger.warning(f"Usage {status.lower()} failed for reservation {reservation_id}: {exc}")


async def start_worker():
    # Parse the Redis URL manually for BullMQ which expects a dictionary
    if settings.redis_url:
        parsed = urlparse(settings.redis_url)
        redis_connection = {
            "host": parsed.hostname,
            "port": parsed.port or 6379,
            "password": parsed.password,
            "ssl": parsed.scheme == "rediss"
        }
    else:
        redis_connection = {
            "host": settings.redis_host,
            "port": settings.redis_port,
        }

    worker = Worker(
        "agent-queue",
        process_agent_task,
        {
            "connection": redis_connection,
        },
    )
    logger.info("BullMQ Worker started — listening on 'agent-queue'")
    return worker
