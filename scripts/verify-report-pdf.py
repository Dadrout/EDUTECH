"""Validate real PDF geometry/text with Poppler, independently of browser sizing."""
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

paths = [Path(value) for value in sys.argv[1:]] or sorted(Path("output/pdf").glob("*.pdf"))
if not paths:
    raise SystemExit("No PDFs: generate previews first.")

for path in paths:
    result = subprocess.run(["pdftotext", "-bbox-layout", str(path), "-"], capture_output=True, text=True, check=True)
    if result.stderr.strip():
        raise AssertionError(f"{path}: Poppler warning: {result.stderr.strip()}")
    root = ET.fromstring(result.stdout)
    pages = root.findall(".//{*}page")
    assert pages, f"{path}: no pages"
    if path.stem.endswith("-report"):
        assert len(pages) == 5, f"{path}: expected five summary pages, got {len(pages)}"
    count = 0
    for number, page in enumerate(pages, 1):
        width, height = float(page.attrib["width"]), float(page.attrib["height"])
        assert abs(width - 841.89) < .1 and abs(height - 595.28) < .1, (path, number, width, height)
        words = page.findall(".//{*}word")
        assert len(words) >= 5, f"{path}: page {number} has no meaningful selectable text"
        for word in words:
            x1, y1, x2, y2 = (float(word.attrib[key]) for key in ("xMin", "yMin", "xMax", "yMax"))
            assert 24 <= x1 <= x2 <= width - 24 and 12 <= y1 <= y2 <= height - 12, (path, number, word.text, word.attrib)
            assert "\ufffd" not in (word.text or ""), f"{path}: replacement glyph on page {number}"
        count += len(words)
    print(f"PASS {path.name}: {len(pages)} A4 landscape pages, {count} selectable words, no text outside margins")
