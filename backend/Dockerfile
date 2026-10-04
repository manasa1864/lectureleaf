# LectureLeaf backend: FastAPI + ffmpeg + OpenCV/OCR + (optional) offline Whisper.
# Build from the backend/ folder:   docker build -t lectureleaf-backend .
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/data/hf

# ffmpeg: audio extraction; libgomp1/libglib2.0-0: needed by onnxruntime and OpenCV; curl: health check
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgomp1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements-ocr.txt ./
RUN pip install -r requirements.txt \
    && pip install --no-deps -r requirements-ocr.txt

# Fetch the OCR models now, so containers start fast and never depend on a download at run time.
RUN python -c "from rapidocr import RapidOCR; RapidOCR(params={'Global.use_rec': False, 'Global.use_cls': False}); RapidOCR(params={'Global.use_cls': False})"

COPY app ./app

RUN useradd --create-home appuser && mkdir -p /data/hf && chown -R appuser /data /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fs "http://localhost:${PORT:-8000}/api/healthz" || exit 1

# One worker on purpose: lecture and quiz jobs run on in-process worker threads.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
