#!/usr/bin/env python3
# scripts/extract_pdf.py
import sys
import io
import re

# Force UTF-8 output on Windows (fixes charmap codec errors)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import pdfplumber

def extract(path):
    lines = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text(layout=True, x_tolerance=3, y_tolerance=3)
            if not text:
                continue
            for line in text.split('\n'):
                stripped = line.strip()
                # Remove layout artifacts and non-printable chars
                stripped = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', stripped)
                stripped = re.sub(r'[^\S\n]+', ' ', stripped).strip()
                if stripped and not re.match(r'^[\s.·_\-]{3,}$', stripped):
                    lines.append(stripped)
    return '\n'.join(lines)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: extract_pdf.py <path>', file=sys.stderr)
        sys.exit(1)
    try:
        print(extract(sys.argv[1]))
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(1)