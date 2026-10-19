FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    tesseract-ocr tesseract-ocr-hun tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Tesseract's OpenMP otherwise starts a thread per visible core in every
# process. Several parses share this small container (one-page scans were
# taking 30s+ in production), and Tesseract's own advice when running
# processes in parallel is one thread each.
ENV OMP_THREAD_LIMIT=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY extract.py roster.txt server.py logging_setup.py .

EXPOSE 8080
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
