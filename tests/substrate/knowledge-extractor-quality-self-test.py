import importlib.util
import tempfile
import zipfile
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location("knowledge_extractor", Path("providers/knowledge-extractor/server.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

good = module.quality("GBAP product manual\nGenerator set 500 kVA\nVoltage 400V\n" * 20)
assert good["accepted"] is True
assert good["tokenishCount"] > 8

empty = module.quality("")
assert empty["accepted"] is False
assert "too_few_characters" in empty["reasons"]

cover = module.quality("usable text " * 200, page_count=44, pages_with_text=2)
assert cover["accepted"] is False
assert "low_page_coverage" in cover["reasons"]

assert ".pdf" in module.SUPPORTED
assert ".docx" in module.SUPPORTED
assert ".xlsx" in module.SUPPORTED
assert ".pptx" in module.SUPPORTED
assert ".docm" in module.SUPPORTED
assert ".xlsm" in module.SUPPORTED
assert ".pptm" in module.SUPPORTED
assert ".docm" in module.ARCHIVE_EXTENSIONS
assert ".xlsm" in module.ARCHIVE_EXTENSIONS
assert ".pptm" in module.ARCHIVE_EXTENSIONS
assert ".doc" in module.LEGACY_TARGET
assert module.LEGACY_TARGET[".xls"] == "xlsx"
assert ".tiff" in module.IMAGE_EXTENSIONS
assert ".eml" in module.SUPPORTED
assert ".epub" in module.SUPPORTED
assert ".yaml" in module.TEXT_EXTENSIONS
assert module.MAX_NORMALIZED_CHARS == 8000000
assert module.MAX_ARCHIVE_MEMBERS == 20000
assert module.MAX_ARCHIVE_UNCOMPRESSED_BYTES == 512 * 1024 * 1024
assert module.OPENDATALOADER_TIMEOUT_SEC == 600
assert module.HANDED_OFF_RETENTION_DAYS == 7
assert module.FAILED_RETENTION_DAYS == 30
assert module.MAINTENANCE_INTERVAL_SEC == 3600

with tempfile.TemporaryDirectory() as root:
    unsafe = Path(root) / "unsafe.docx"
    with zipfile.ZipFile(unsafe, "w") as archive:
        archive.writestr("../escape.xml", "<xml>escape</xml>")
    try:
        module.validate_archive_container(unsafe)
        raise AssertionError("unsafe archive traversal path was accepted")
    except RuntimeError as exc:
        assert str(exc) == "archive_unsafe_path"

print("PASS: Knowledge extractor quality/resource gates reject empty, partial and unsafe enterprise documents.")

with tempfile.TemporaryDirectory() as root:
    source = Path(root) / "scanned.pdf"
    ocr_result = Path(root) / "searchable.pdf"
    text = "GBAP generator product specifications voltage 400V frequency 50Hz. " * 30
    def native_metrics(path):
        return (text, 44, 44) if path == ocr_result else ("", 44, 0)
    with patch.object(module, "extract_opendataloader", side_effect=RuntimeError("structural_parser_unavailable")), \
         patch.object(module, "ocr_pdf", return_value=ocr_result), \
         patch.object(module, "pdf_native_metrics", side_effect=native_metrics):
        extracted, parser, metrics, attempts = module.extract_pdf(source, root, [])
    assert parser == "OCRMY_PDF_PYMUPDF_NATIVE"
    assert extracted == text
    assert metrics["accepted"] is True
    assert metrics["pageCoverage"] == 1
    assert any(item.get("parser") == "OCRMY_PDF_OPENDATALOADER" and not item["accepted"] for item in attempts)

print("PASS: OCR-success/structural-parser-failure still yields quality-checked native PDF text.")
