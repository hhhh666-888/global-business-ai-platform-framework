import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import zipfile
import urllib.error
import urllib.request
from pathlib import Path

import pymupdf
from openpyxl import Workbook

# Actual HTTP service + persistent queue + native PDF parser. Structural/OCR
# engines are validated separately; no RAGFlow or embedding success is implied.
with tempfile.TemporaryDirectory(prefix="gbap-extractor-http-") as root:
    root = Path(root)
    pdf_path = root / "manual.pdf"
    pdf = pymupdf.open()
    for page in range(44):
        sheet = pdf.new_page()
        sheet.insert_text((50, 80), f"GBAP PRODUCT MANUAL page {page + 1}\nGenerator set 500 kVA voltage 400V frequency 50Hz.\nTechnical specifications and installation instructions.")
    pdf.embfile_add("size-boundary.bin", os.urandom(int(16.4 * 1024 * 1024)))
    pdf.save(pdf_path)
    pdf.close()
    raw = pdf_path.read_bytes()
    assert 16 * 1024 * 1024 < len(raw) < 25 * 1024 * 1024
    # Use an available ephemeral port without disturbing an installed runtime.
    import socket
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    log = (root / "service.log").open("w+")
    proc = subprocess.Popen([sys.executable, os.environ.get("KNOWLEDGE_EXTRACTOR_TEST_SCRIPT", "providers/knowledge-extractor/server.py")], env={**os.environ, "KNOWLEDGE_EXTRACTOR_PORT": str(port), "KNOWLEDGE_EXTRACTOR_DATA": str(root / "data"), "KNOWLEDGE_OPENDATALOADER_TIMEOUT_SEC": "5", "KNOWLEDGE_MAX_SPREADSHEET_CELLS": "100", "KNOWLEDGE_MAX_SPREADSHEET_ROWS": "1000"}, stdout=log, stderr=log)
    def request(path, body=None):
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=json.dumps(body).encode() if body is not None else None, headers={"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.load(response)
    def terminal(job_id, timeout=10):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            state = request(f"/jobs/{job_id}")
            if state["state"] in ["READY", "FAILED"]:
                return state
            time.sleep(0.05)
        raise AssertionError(f"job did not terminate: {state}")
    def upload(filename, content, media_type):
        return request("/jobs", {"sourceFilename": filename, "mediaType": media_type, "contentBase64": base64.b64encode(content).decode()})["jobId"]
    try:
        for attempt in range(100):
            try:
                if request("/health")["status"] == "ok":
                    break
            except Exception:
                time.sleep(0.03)
        else:
            raise AssertionError("extractor did not start")
        uploaded = request("/jobs", {"sourceFilename": "中文产品手册44页.pdf", "mediaType": "application/pdf", "contentBase64": base64.b64encode(raw).decode()})
        job_id = uploaded["jobId"]
        state = terminal(job_id, 45)
        assert state["state"] == "READY", state
        assert state["metrics"]["pageCount"] == 44
        assert state["metrics"]["pageCoverage"] == 1
        normalized = request(f"/jobs/{job_id}/result")
        text = base64.b64decode(normalized["contentBase64"]).decode()
        assert "GBAP PRODUCT MANUAL page 44" in text
        assert "size-boundary.bin" not in text
        source = Path(root / "data" / "jobs" / job_id / "source.pdf")
        assert source.read_bytes() == raw
        print("PASS: real HTTP extraction persists and normalizes a Chinese-name 16.4+ MB, 44-page PDF with complete page coverage.")

        workbook = Workbook()
        workbook.active.append(["Model", "Voltage", "Product specification"])
        workbook.active.append(["FG-500", 400, "GBAP enterprise generator set rated power 500 kVA frequency 50 Hz"])
        packed = io.BytesIO()
        workbook.save(packed)
        # Real producer defect: declared grid is huge, actual XML has two rows.
        inflated = io.BytesIO()
        with zipfile.ZipFile(packed) as source, zipfile.ZipFile(inflated, "w", zipfile.ZIP_DEFLATED) as destination:
            for entry in source.infolist():
                content = source.read(entry)
                if entry.filename == "xl/worksheets/sheet1.xml":
                    content = content.replace(b'<dimension ref="A1:C2"', b'<dimension ref="A1:XFD1048576"')
                    assert b'A1:XFD1048576' in content
                destination.writestr(entry, content)
        xlsx_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        inflated_id = upload("中文产品参数.xlsx", inflated.getvalue(), xlsx_type)
        state = terminal(inflated_id)
        assert state["state"] == "READY", state
        assert state["metrics"]["sheets"][0]["rows"] == 2, state
        text = base64.b64decode(request(f"/jobs/{inflated_id}/result")["contentBase64"]).decode()
        assert "FG-500" in text and "400" in text
        print("PASS: XLSX declaring the whole Excel grid follows its actual two XML rows and completes through HTTP.")

        for index in range(50):
            workbook.active.append([f"FG-{index}", 400, "generator specification"])
        oversized = io.BytesIO()
        workbook.save(oversized)
        oversized_id = upload("超出处理资源.xlsx", oversized.getvalue(), xlsx_type)
        failed = terminal(oversized_id)
        assert failed["state"] == "FAILED" and "document_complexity_limit" in failed["error"], failed
        assert (root / "data" / "jobs" / oversized_id / "source.xlsx").read_bytes() == oversized.getvalue()
        next_id = upload("后续正常文档.txt", b"GBAP enterprise generator product manual rated power 500 kVA voltage 400V frequency 50Hz installation maintenance instructions.", "text/plain")
        assert terminal(next_id)["state"] == "READY", "failed document blocked the queue"
        print("PASS: actual HTTP complexity failure preserves the original and releases the queue for the next document.")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        log.close()
