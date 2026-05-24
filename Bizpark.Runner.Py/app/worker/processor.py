import logging
import uuid as uuid_lib

from bullmq import Worker
from sqlalchemy import select

from app.config import settings
from app.db.models import AgentTask, TaskStatus
from app.db.session import async_session
from app.agents.website_builder import run_website_builder
from app.agents.google_review_reply import run_google_review_reply_agent

logger = logging.getLogger("runner.processor")


async def process_agent_task(job, token=None):
    job_data = job.data
    task_id = job_data["taskId"]
    business_id = job_data["businessId"]
    task_type = job_data["taskType"]
    input_data = job_data.get("inputData", {})

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

        try:
            if task_type == "WEBSITE_GENERATION":
                output = await _handle_website_generation(input_data)
                task.status = TaskStatus.PENDING_APPROVAL
                task.outputData = output
            elif task_type == "GOOGLE_REVIEW_REPLY":
                output = await _handle_google_review_reply(input_data)
                task.status = TaskStatus.COMPLETED
                task.outputData = output
            else:
                task.status = TaskStatus.COMPLETED
                task.outputData = {"message": f"{task_type} not yet implemented"}

        except Exception as exc:
            logger.error(f"[AGENT ERROR] Task {task_id}: {exc}")
            task.status = TaskStatus.FAILED
            task.outputData = {"error": str(exc)}

        await session.commit()

    logger.info(f"[AGENT DONE] Task {task_id}: {task.status.value}")


async def _handle_website_generation(input_data: dict) -> dict:
    business = input_data.get("business", {})
    website_config = input_data.get("websiteConfig", {})
    cms_data = website_config.get("cmsData", {})
    tone = input_data.get("tone", "professional")

    generated = await run_website_builder(
        business=business,
        raw_cms_data=cms_data,
        tone=tone,
    )

    return {
        "generatedContent": generated,
        "businessId": business.get("id"),
    }


from urllib.parse import urlparse


async def _handle_google_review_reply(input_data: dict) -> dict:
    business = input_data.get("business", {})
    review = input_data.get("review", {})
    policy = input_data.get("policy", {})

    return await run_google_review_reply_agent(
        business=business,
        review=review,
        policy=policy,
    )


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
