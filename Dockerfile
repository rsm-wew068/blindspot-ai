FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080 BLINDSPOT_DATA_DIR=/data
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
COPY --chown=app:app hosted.py server.py investigation.py simulation.py ./
COPY --chown=app:app static ./static
USER app
EXPOSE 8080
CMD ["python", "hosted.py"]
