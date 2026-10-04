"""The worker pool shared by lecture processing and quiz generation."""
from concurrent.futures import ThreadPoolExecutor

from . import config

# Jobs wait in 'queued' instead of overloading the machine when many are submitted at once.
executor = ThreadPoolExecutor(max_workers=config.MAX_CONCURRENT_JOBS, thread_name_prefix="job")

# Quizzes get their own workers so they never queue behind a long lecture-processing job.
quiz_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="quiz")
