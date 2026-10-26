"""Build bundled status-bar icons: python -m pip install fonttools==4.64.0
Then run: python tools/build-icons.py
No font tooling is needed at extension runtime.
"""
from pathlib import Path
from xml.etree import ElementTree
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

root = Path(__file__).resolve().parent.parent
names = [".notdef", "claude", "codex"]
glyphs = {".notdef": TTGlyphPen(None).glyph()}
for name in names[1:]:
    svg = ElementTree.parse(root / "resources" / (name + ".svg")).getroot()
    pen = TTGlyphPen(None)
    # Match VS Code Codicon: full-em ascent, zero descent. Flip SVG y-down coordinates.
    outline = TransformPen(Cu2QuPen(pen, max_err=0.5), (38, 0, 0, -38, 44, 956))
    for node in svg.iter("{http://www.w3.org/2000/svg}path"):
        parse_path(node.attrib["d"], outline)
    glyphs[name] = pen.glyph()

font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(names)
font.setupCharacterMap({0xE001: "claude", 0xE002: "codex"})
font.setupGlyf(glyphs)
font.setupHorizontalMetrics({name: (1000, getattr(glyphs[name], "xMin", 0)) for name in names})
font.setupHorizontalHeader(ascent=1000, descent=0)
font.setupNameTable({"familyName": "Claude Codex Limits Icons", "styleName": "Regular", "uniqueFontIdentifier": "ClaudeCodexLimitsIcons-1", "fullName": "Claude Codex Limits Icons", "psName": "ClaudeCodexLimitsIcons"})
font.setupOS2(sTypoAscender=1000, sTypoDescender=0, usWinAscent=1000, usWinDescent=0)
font.setupPost()
font.setupMaxp()
font.font.flavor = "woff"
font.save(root / "resources" / "service-icons.woff")
print("Built resources/service-icons.woff")
