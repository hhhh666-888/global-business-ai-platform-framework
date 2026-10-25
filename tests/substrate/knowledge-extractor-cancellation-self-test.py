import importlib.util
import json
import os
import sys
import tempfile
import threading
import time
import urllib.request
import uuid
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("extractor_cancel_fixture", Path("providers/knowledge-extractor/server.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix="gbap-extractor-cancel-") as root:
    module.DATA_ROOT = Path(root)
    module.JOBS_ROOT = Path(root) / "jobs"
    module.DB_PATH = Path(root) / "extractor.db"
    module.ensure_storage()
    first_id, next_id = str(uuid.uuid4()), str(uuid.uuid4())
    pid_path = Path(root) / "child.pid"
    conn = module.db()
    for job_id in [first_id, next_id]:
        job_dir = module.JOBS_ROOT / job_id
        job_dir.mkdir()
        source = job_dir / "source.txt"
        source.write_text("GBAP product manual parameters voltage current frequency. " * 20)
        conn.execute("INSERT INTO jobs(id,state,stage,source_filename,media_type,input_path,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", (job_id, "QUEUED", "QUEUED", "manual.txt", "text/plain", str(source), module.now(), module.now()))
    conn.commit()
    conn.close()
    server = module.ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
    http_thread = threading.Thread(target=server.serve_forever, daemon=True)
    http_thread.start()
    def parser(path):
        if path.parent.name == first_id:
            command = [sys.executable, "-c", "import os,sys;open(sys.argv[1],'w').write(str(os.getpid()))\nwhile True: pass", str(pid_path)]
            with tempfile.TemporaryDirectory(prefix="gbap-native-cancel-") as parser_root:
                module.run_isolated_parser(command, parser_root, timeout=120)
            raise AssertionError("cancelled parser should not complete")
        text = path.read_text()
        return text, "TEXT_NATIVE", module.quality(text), []
    try:
        with patch.object(module, "parse_document_isolated", side_effect=parser):
            worker = threading.Thread(target=module.process_job, args=(first_id,))
            worker.start()
            deadline = time.monotonic() + 5
            while not pid_path.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            assert pid_path.exists(), "fixture subprocess did not start"
            pid = int(pid_path.read_text())
            started = time.monotonic()
            req = urllib.request.Request(f"http://127.0.0.1:{server.server_port}/jobs/{first_id}", method="DELETE")
            with urllib.request.urlopen(req, timeout=3) as response:
                assert json.load(response)["removed"] is True
            worker.join(timeout=3)
            assert not worker.is_alive(), "deleted job retained the only extraction worker"
            assert time.monotonic() - started < 3
            try:
                os.kill(pid, 0)
                raise AssertionError("deleted job parser subprocess is still running")
            except ProcessLookupError:
                pass
            assert not (module.JOBS_ROOT / first_id).exists(), "cancelled derived job bytes were not cleaned up"
            module.process_job(next_id)
            conn = module.db()
            assert conn.execute("SELECT state FROM jobs WHERE id=?", (first_id,)).fetchone()["state"] == "CANCELLED"
            assert conn.execute("SELECT state FROM jobs WHERE id=?", (next_id,)).fetchone()["state"] == "READY"
            conn.close()
        print("PASS: HTTP deletion interrupts a CPU-bound native parser promptly and releases the worker for the next document.")
    finally:
        server.shutdown()
        server.server_close()
