"""Generate lesson audio with Microsoft's neural Pakistani Urdu voices.

Voices: ur-PK-UzmaNeural (female) for lessons, words and female characters;
        ur-PK-AsadNeural (male) for male conversation characters.
Writes public/content/audio/*.mp3 and audio/index.json:
  {"f": {text: file}, "m": {text: file}, "w": {word: file}}
Re-run after editing content; existing files are reused.

Setup:  pip install edge-tts      Run:  python scripts/gen_audio.py
Note: uses the free Microsoft Edge read-aloud service (unofficial) — fine for personal or
class use. For a public product, generate the same voices through Azure Speech instead.
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
FEMALE, MALE = "ur-PK-UzmaNeural", "ur-PK-AsadNeural"
MALE_PARTNERS = {"Bilal", "Rashid sahab", "Waiter", "Shopkeeper", "Passer-by", "Hamza", "Driver"}
URDU = re.compile(r"[؀-ۿ]")
PUNCT = re.compile(r"[ً-ٰٟ]|[۔؟،!?.,:;\"'()…\-—]")


def read(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


def spoken(text):
    t = re.sub(r"\{name\}", "علی", text)
    return re.sub(r"\{\w+\}|\.\.\.|…", "", t).strip()


lines = {"f": set(), "m": set()}
words = set()


def add(text, voice="f"):
    if isinstance(text, str) and URDU.search(text):
        lines[voice].add(text.strip())
        for w in PUNCT.sub(" ", re.sub(r"\{\w+\}", "", text)).split():
            if URDU.search(w):
                words.add(w)


course = read("course.json")
for u in course["units"]:
    for l in read(u["file"])["lessons"]:
        for p in l["phrases"]:
            add(p["urdu"])
            gv = p.get("genderVariants")
            if gv:
                add(gv["masculine"]["urdu"]); add(gv["feminine"]["urdu"])
        dlg = l.get("dialogue")
        if dlg:
            pv = "m" if dlg["partner"].get("voice") == "m" else "f"
            for line in dlg["lines"]:
                add(line["urdu"], pv if line["who"] == "them" else "f")
                if line.get("f"):
                    add(line["f"]["urdu"])
        for ex in l.get("exercises", []):
            for c in ex.get("context", []):
                add(c["urdu"])
            for o in ex.get("options", []):
                if isinstance(o, dict):
                    add(o.get("urdu"))
for c in read(course["extras"]["conversations"]):
    v = "m" if c["partner"]["name"] in MALE_PARTNERS else "f"
    for n in c["nodes"]:
        add(n["line"]["urdu"], v)
        for ch in n.get("choices", []):
            add(ch["urdu"])
        for w in n.get("newWords", []):
            add(w["urdu"])
for d in read(course["extras"]["pronunciation"]):
    for it in d["items"]:
        add(it["urdu"])
sp = read(course["extras"]["speaking"])
for q in sp["questions"]:
    add(q["question"]["urdu"])
    for a in q["answers"]:
        add(a["urdu"])
for p in sp["passages"]:
    for l in p["lines"]:
        add(l["urdu"])

jobs = []  # (index section, key, text to speak, voice)
for sec, voice in (("f", FEMALE), ("m", MALE)):
    for t in sorted(lines[sec]):
        jobs.append((sec, t, spoken(t), voice))
for w in sorted(words):
    jobs.append(("w", w, w, FEMALE))

index = {"f": {}, "m": {}, "w": {}}
sem = asyncio.Semaphore(6)
failed = []


async def make(sec, key, text, voice):
    if not text:
        return
    name = hashlib.sha1(f"{voice}|{text}".encode()).hexdigest()[:12] + ".mp3"
    path = OUT / name
    if not path.exists():
        async with sem:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(text, voice, rate="-10%").save(str(path))
                    break
                except Exception as e:  # noqa: BLE001
                    if attempt == 2:
                        failed.append((text, str(e)))
                        return
                    await asyncio.sleep(2)
    index[sec][key] = name


async def main():
    await asyncio.gather(*(make(*j) for j in jobs))
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    keep = {f for sec in index.values() for f in sec.values()}
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
    print(f"lines f={len(index['f'])} m={len(index['m'])} words={len(index['w'])} failed={len(failed)}")
    for t, e in failed[:5]:
        print("failed:", t, e)


asyncio.run(main())
