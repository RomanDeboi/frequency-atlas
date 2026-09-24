#!/usr/bin/env python3
"""Assemble the standalone single-file Frequency Atlas prototype."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
head = """<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Frequency Atlas — offline prototype</title>
<style>
"""
result = (head + (root / "prototype-base.css").read_text() + "\n"
          + (root / "prototype-extra.css").read_text()
          + "\n</style>\n</head>\n"
          + (root / "prototype-body.html").read_text()
          + (root / "prototype-src.js").read_text()
          + "\n</script>\n</body>\n</html>\n")
(root / "prototype.html").write_text(result)
(root / "public/prototype.html").write_text(result)
print(f"Built prototype.html / public/prototype.html ({len(result):,} characters)")
