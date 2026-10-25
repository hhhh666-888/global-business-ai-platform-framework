"""Exercise real busy native processes, descendants and resource exhaustion."""
import importlib.util
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location("extractor_supervision", Path("providers/knowledge-extractor/server.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def stopped(pid):
    try:
        # A reparented zombie cannot execute or retain parser resources.
        return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[0] == "Z"
    except FileNotFoundError:
        return True


def supervise(code, expected, *, timeout=5, max_rss=128 * 1024 * 1024, max_temp=8 * 1024 * 1024, cancel=False, service_stop=False):
    with tempfile.TemporaryDirectory(prefix="gbap-supervision-") as root:
        event = threading.Event()
        module.CURRENT_JOB.cancel_event = event
        timer = threading.Timer(0.8, module.STOP.set if service_stop else event.set) if cancel or service_stop else None
        if timer:
            timer.start()
        started = time.monotonic()
        try:
            command = [sys.executable, "-c", code, root]
            try:
                status = module.run_isolated_parser(command, root, timeout=timeout, max_rss=max_rss, max_temp=max_temp)
                assert expected is None and status == 0, (expected, status)
            except RuntimeError as exc:
                assert expected and str(exc).startswith(expected), str(exc)
            assert time.monotonic() - started < 4, "supervisor failed to release its worker promptly"
            for pid_file in Path(root).glob("*.pid"):
                pid = int(pid_file.read_text())
                deadline = time.monotonic() + 0.5
                while not stopped(pid) and time.monotonic() < deadline:
                    time.sleep(0.01)
                assert stopped(pid), f"parser descendant still running: {pid_file}"
        finally:
            if timer:
                timer.cancel()
                timer.join()
            module.CURRENT_JOB.cancel_event = None
            module.STOP.clear()


busy = """
import os, sys, subprocess
from pathlib import Path
root = Path(sys.argv[1])
(root/'parent.pid').write_text(str(os.getpid()))
child = subprocess.Popen([sys.executable, '-c', 'while True: pass'])
(root/'descendant.pid').write_text(str(child.pid))
while True: pass
"""
supervise(busy, "document_parse_timeout:", timeout=0.8)
supervise(busy, "extraction_cancelled", cancel=True)
supervise(busy, "extraction_cancelled", service_stop=True)
supervise("import os,sys;from pathlib import Path;root=Path(sys.argv[1]);(root/'parent.pid').write_text(str(os.getpid()));data=bytearray(50*1024*1024)\nwhile True: pass", "document_parse_memory_limit", max_rss=24 * 1024 * 1024)
supervise("import os,sys;from pathlib import Path;root=Path(sys.argv[1]);(root/'parent.pid').write_text(str(os.getpid()));(root/'oversize.bin').write_bytes(b'x'*2*1024*1024)\nwhile True: pass", "document_parse_storage_limit", max_temp=1024 * 1024)
# Successful parsers must also release converter descendants before returning.
supervise("import subprocess,sys;from pathlib import Path;child=subprocess.Popen([sys.executable,'-c','while True: pass']);(Path(sys.argv[1])/'descendant.pid').write_text(str(child.pid))", None)
supervise("print('Next document completes normally after all failures')", None)
print("PASS: real native parser groups stop on timeout, cancellation, service stop, memory/storage limits and successful exit; subsequent parsing continues.")
