"""Generate character voices with Microsoft's neural Urdu voices.

Each character in public/content/characters.json has a voice (name, pitch, rate). This script records:
  - Leni (teacher): every phrase, exercise line, passage, question and individual word
  - each unit's host character: the unit's phrases (guidebook examples) + praise lines
  - each lesson's conversation partner: the lesson's phrases (they teach them to you),
    their conversation lines, and praise lines
  - each role-play partner: their lines + praise lines
Writes public/content/audio/*.mp3 and audio/index.json: {"voices": {charId: {text: file}}, "w": {word: file}}
Re-run after editing content; existing files are reused.

Setup:  pip install edge-tts      Run:  python scripts/gen_audio.py
Note: uses the free Microsoft Edge read-aloud service (unofficial) — fine for personal or
class use. For a large public product, generate the same voices through Azure Speech instead.
"""
import asyncio
import hashlib
import json
import re
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent / "public" / "content"
OUT = ROOT / "audio"
OUT.mkdir(parents=True, exist_ok=True)
URDU = re.compile(r"[؀-ۿ]")
PUNCT = re.compile(r"[ً-ٰٟ]|[۔؟،!?.,:;\"'()…\-—]")
# Spoken praise and encouragement (must match src/lib/teacher.ts).
PRAISE = ["شاباش!", "بہت اچھا!", "زبردست!", "کمال!", "بالکل ٹھیک!", "کوئی بات نہیں، پھر کوشش کریں!", "شاباش! آپ نے کمال کر دیا!"]


def read(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


course = read("course.json")
chars = {c["id"]: c for c in read(course["extras"]["characters"])}
alias = {a: c["id"] for c in chars.values() for a in [c["name"], *c.get("aliases", [])]}
lines = {cid: set() for cid in chars}
words = set()


def add(cid, text):
    if not (isinstance(text, str) and URDU.search(text)):
        return
    lines[cid].add(text.strip())
    for w in PUNCT.sub(" ", re.sub(r"\{\w+\}", "", text)).split():
        if URDU.search(w):
            words.add(w)


def phrase_texts(p):
    out = [p["urdu"]]
    gv = p.get("genderVariants")
    if gv:
        out += [gv["masculine"]["urdu"], gv["feminine"]["urdu"]]
    return out


for u in course["units"]:
    unit = read(u["file"])
    host = unit.get("host", "leni")
    for t in PRAISE:
        add(host, t)
    for l in unit["lessons"]:
        partner = (l.get("dialogue") or {}).get("partner", {}).get("character", host)
        for t in PRAISE:
            add(partner, t)
        for p in l["phrases"] + l.get("builds", []):
            for t in phrase_texts(p):
                add("leni", t); add(host, t); add(partner, t)
        dlg = l.get("dialogue")
        if dlg:
            for line in dlg["lines"]:
                add(partner if line["who"] == "them" else "leni", line["urdu"])
                if line.get("f"):
                    add("leni", line["f"]["urdu"])
        for ex in l.get("exercises", []):
            for c in ex.get("context", []):
                add("leni", c["urdu"])
            for o in ex.get("options", []):
                if isinstance(o, dict):
                    add("leni", o.get("urdu"))
for t in PRAISE:
    add("leni", t)
for c in read(course["extras"]["conversations"]):
    pid = c["partner"].get("character") or alias.get(c["partner"]["name"], "townman")
    for t in PRAISE:
        add(pid, t)
    for n in c["nodes"]:
        add(pid, n["line"]["urdu"])
        for ch in n.get("choices", []):
            add("leni", ch["urdu"])
        for w in n.get("newWords", []):
            add("leni", w["urdu"])
for d in read(course["extras"]["pronunciation"]):
    for it in d["items"]:
        add("leni", it["urdu"])
sp = read(course["extras"]["speaking"])
for q in sp["questions"]:
    add("leni", q["question"]["urdu"])
    for a in q["answers"]:
        add("leni", a["urdu"])
for p in sp["passages"]:
    for l in p["lines"]:
        add("leni", l["urdu"])


def spoken(text):
    t = re.sub(r"\{name\}", "علی", text)
    return re.sub(r"\{\w+\}|\.\.\.|…", "", t).strip()


jobs = [(cid, t, spoken(t), chars[cid]["voice"]) for cid, ts in lines.items() for t in sorted(ts)]
jobs += [("__w", w, w, chars["leni"]["voice"]) for w in sorted(words)]
index = {"voices": {cid: {} for cid in chars}, "w": {}}
sem = asyncio.Semaphore(6)
failed = []


async def make(cid, key, text, v):
    if not text:
        return
    name = hashlib.sha1(f"{v['name']}|{v['pitch']}|{v['rate']}|{text}".encode()).hexdigest()[:12] + ".mp3"
    path = OUT / name
    if not path.exists():
        async with sem:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(text, v["name"], rate=v["rate"], pitch=v["pitch"]).save(str(path))
                    break
                except Exception as e:  # noqa: BLE001
                    if attempt == 2:
                        failed.append((text, str(e)))
                        return
                    await asyncio.sleep(2)
    (index["w"] if cid == "__w" else index["voices"][cid])[key] = name


async def main():
    await asyncio.gather(*(make(*j) for j in jobs))
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    keep = {f for sec in index["voices"].values() for f in sec.values()} | set(index["w"].values())
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
    counts = ", ".join(f"{k}={len(v)}" for k, v in index["voices"].items())
    print(f"{counts}, words={len(index['w'])}, failed={len(failed)}")
    for t, e in failed[:5]:
        print("failed:", t, e)


asyncio.run(main())
