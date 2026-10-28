#!/usr/bin/env python3
# python3 gen-photos.py
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "assets", "p")
EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}


def natural(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def main():
    if not os.path.isdir(ROOT):
        sys.exit("no src/assets/p folder found")
    folders = []
    for name in sorted(os.listdir(ROOT), key=natural):
        path = os.path.join(ROOT, name)
        if not os.path.isdir(path) or name.startswith("."):
            continue
        files = [
            f
            for f in os.listdir(path)
            if os.path.splitext(f)[1].lower() in EXTS and not f.startswith(".")
        ]
        entry = {"id": name, "photos": sorted(files, key=natural)}
        title_path = os.path.join(path, "title.txt")
        if os.path.isfile(title_path):
            with open(title_path, encoding="utf-8") as fh:
                title = fh.readline().strip()
            if title:
                entry["title"] = title
        folders.append(entry)
    out = os.path.join(ROOT, "photos.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"folders": folders}, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("wrote %s (%d folders, %d photos)" % (
        os.path.relpath(out),
        len(folders),
        sum(len(f["photos"]) for f in folders),
    ))


main()