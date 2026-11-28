FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

ENV WHISPER_HOST=0.0.0.0
ENV WHISPER_PORT=50022
ENV WHISPER_MODEL=small
ENV WHISPER_DEVICE=cpu
ENV WHISPER_COMPUTE_TYPE=int8
ENV WHISPER_MODEL_DIR=/models
ENV WHISPER_PERSIST_AUDIO=false
ENV PYTHONUNBUFFERED=1

EXPOSE 50022

CMD ["python", "server.py"]
