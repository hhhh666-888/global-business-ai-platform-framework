#!/usr/bin/env python3
"""Generate deterministic synthetic knowledge fixtures without external packages."""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


def write_pdf(path: Path) -> None:
    chinese = "GBAP合成测试：厄瓜多尔测试项目备用电源编号为 FG-PDF-2048。此内容不代表真实客户或真实项目。"
    ascii_line = "GBAP SYNTHETIC PDF FIXTURE. Backup power code: FG-PDF-2048. No real company data."
    chinese_hex = (b"\xfe\xff" + chinese.encode("utf-16-be")).hex().upper()
    ascii_text = ascii_line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = (
        "BT /F1 15 Tf 48 760 Td <" + chinese_hex + "> Tj ET\n"
        "BT /F2 12 Tf 48 720 Td (" + ascii_text + ") Tj ET\n"
    ).encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 7 0 R >>",
        b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>",
        b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"endstream",
    ]
    content = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(content))
        content.extend(f"{index} 0 obj\n".encode("ascii"))
        content.extend(obj)
        content.extend(b"\nendobj\n")
    xref = len(content)
    content.extend(f"xref\n0 {len(objects)+1}\n".encode("ascii"))
    content.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        content.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    content.extend(
        f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
    )
    path.write_bytes(content)


def write_docx(path: Path) -> None:
    text = "GBAP合成测试：储能测试参数代号为 GBAP-DOCX-1600，夜间备电时长为4小时。仅用于RAGFlow PoU，不含真实公司数据。"
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{escape(text)}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>"""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("word/document.xml", document)


def write_xlsx(path: Path) -> None:
    rows = [
        ("字段", "GBAP合成测试值"),
        ("报价测试代号", "GBAP-XLSX-675"),
        ("说明", "这是虚构测试数据，不代表真实报价、汇率或客户。"),
    ]
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""
    workbook = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PoU" sheetId="1" r:id="rId1"/></sheets></workbook>"""
    workbook_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>"""
    sheet_rows = []
    for row_idx, pair in enumerate(rows, 1):
        cells = []
        for col_idx, value in enumerate(pair):
            col = chr(ord("A") + col_idx)
            cells.append(f'<c r="{col}{row_idx}" t="inlineStr"><is><t>{escape(value)}</t></is></c>')
        sheet_rows.append(f'<row r="{row_idx}">{"".join(cells)}</row>')
    sheet = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{''.join(sheet_rows)}</sheetData></worksheet>"""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: generate-knowledge-pou-fixtures.py OUTPUT_DIR")
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    write_pdf(output / "gbap-pou.pdf")
    write_docx(output / "gbap-pou.docx")
    write_xlsx(output / "gbap-pou.xlsx")
    manifest = {
        "policy": "SYNTHETIC_FIXTURES_ONLY",
        "fixtures": [
            {
                "filename": "gbap-pou.pdf",
                "mediaType": "application/pdf",
                "title": "GBAP Synthetic PDF PoU",
                "token": "FG-PDF-2048",
                "question": "厄瓜多尔测试项目的备用电源编号是什么？",
            },
            {
                "filename": "gbap-pou.docx",
                "mediaType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "title": "GBAP Synthetic DOCX PoU",
                "token": "GBAP-DOCX-1600",
                "question": "储能测试参数代号是什么，夜间备电时长是多少？",
            },
            {
                "filename": "gbap-pou.xlsx",
                "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "title": "GBAP Synthetic XLSX PoU",
                "token": "GBAP-XLSX-675",
                "question": "报价测试代号是什么？",
            },
        ],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"generated": [item["filename"] for item in manifest["fixtures"]], "output": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
