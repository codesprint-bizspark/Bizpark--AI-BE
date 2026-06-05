"""
Standalone BullMQ worker — no HTTP server, no uvicorn, no restarts.
Run with:  python run.py
"""
import asyncio
import logging
import signal
import sys


from app.config import settings  # noqa: F401 — loads .env before anything else
from app.worker.processor import start_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("runner")


async def main():
    logger.info("BizSpark Runner starting...")
    worker = await start_worker()

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass  # Windows: signal handlers not supported in asyncio, Ctrl+C still works

    logger.info("Worker ready — waiting for jobs on 'agent-queue'")
    await stop.wait()

    logger.info("Shutting down worker...")
    await worker.close()
    logger.info("Worker stopped.")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
