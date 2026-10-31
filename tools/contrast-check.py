#!/usr/bin/env python3
"""Proverava WCAG kontrast parova boja iz css/tokens.css."""
import re, os
css = open(os.path.join(os.path.dirname(__file__), "..", "css", "tokens.css"), encoding="utf-8").read()
tok = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", css))
def lum(h):
    c = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(a, b):
    la, lb = sorted((lum(tok[a]), lum(tok[b])), reverse=True)
    return (la + 0.05) / (lb + 0.05)
pairs = [("ink","cream"),("ink-soft","cream"),("ink-mute","cream"),("matcha","cream"),("matcha-600","cream"),
         ("peach-ink","cream"),("ink","peach"),("cream","matcha"),("matcha-300","matcha"),("ink","sage"),("matcha","sage"),
         ("ink-soft","paper"),("danger","paper"),("success","paper"),("peach","matcha"),("ink-mute","paper")]
bad = 0
for a, b in pairs:
    r = ratio(a, b); ok = r >= 4.5; bad += not ok
    print(f"{a:>11} on {b:<8} {r:5.2f}:1 {'OK' if ok else 'FAIL (samo veliki tekst)' if r>=3 else 'FAIL'}")
