#!/usr/bin/env python3
"""Parse the official Oxford 3000 by CEFR level PDF into a small CSV.

The PDF is intentionally not committed. Download it from Oxford Learner's
Dictionaries and pass its local path to this script.
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

import pdfplumber


LEVELS = {"A1", "A2", "B1", "B2"}
COLUMN_BOUNDARIES = (0, 160, 290, 420, 596)
POS_PATTERN = re.compile(
    r"\s+(?:indefinite article|modal v\.|auxiliary v\.|linking v\.|"
    r"ordinal number|number|det\./pron\./adv\.|det\./pron\.|"
    r"det\., pron\.|det\.|pron\.|prep\.|adv\.|adj\.|n\.|v\.|conj\.|"
    r"exclam\.|article)(?:\s|,|/|$)"
)


def group_lines(words: list[dict]) -> list[tuple[float, str, float]]:
    rows: list[list[dict]] = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        if not rows or abs(rows[-1][0]["top"] - word["top"]) > 2:
            rows.append([word])
        else:
            rows[-1].append(word)

    return [
        (
            row[0]["top"],
            " ".join(item["text"] for item in sorted(row, key=lambda item: item["x0"])),
            max(float(item.get("size", 0)) for item in row),
        )
        for row in rows
    ]


def normalize_headword(value: str) -> list[str]:
    value = re.sub(r"\s*\([^)]*\)\s*", " ", value)
    value = re.sub(r"(?<=[A-Za-z])\d+$", "", value)
    value = re.sub(r"\s+", " ", value).strip(" ,")
    if value == "a, an":
        return ["a", "an"]
    return [value] if value else []


def parse_pdf(input_path: Path) -> list[tuple[str, str]]:
    current_level: str | None = None
    entries: dict[str, str] = {}

    with pdfplumber.open(input_path) as document:
        for page in document.pages:
            words = page.extract_words(extra_attrs=["size", "fontname"])
            for left, right in zip(COLUMN_BOUNDARIES, COLUMN_BOUNDARIES[1:]):
                column = [
                    word
                    for word in words
                    if left <= word["x0"] < right and 120 <= word["top"] <= 805
                ]
                for _, text, size in group_lines(column):
                    text = text.strip()
                    if text in LEVELS and size >= 17:
                        current_level = text
                        continue
                    if not current_level:
                        continue

                    marker = POS_PATTERN.search(text)
                    if not marker:
                        continue
                    for headword in normalize_headword(text[: marker.start()]):
                        entries.setdefault(headword.lower(), current_level)

    return sorted(entries.items(), key=lambda item: (item[1], item[0]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_csv", type=Path)
    args = parser.parse_args()

    entries = parse_pdf(args.input_pdf)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output)
        writer.writerow(["lemma", "cefr"])
        writer.writerows(entries)

    counts = {level: 0 for level in sorted(LEVELS)}
    for _, level in entries:
        counts[level] += 1
    print(f"Parsed {len(entries)} unique headwords: {counts}")


if __name__ == "__main__":
    main()
