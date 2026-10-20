#!/usr/bin/env python3
"""
sovereign_wakeup.py
===================

Author: Michael Patrick McNulty (Mike)
Project: Aethryn (www.aethryn.com)
Created: October 2026
License: Sovereign (No weight mutation. Structure wins over size.)

Sovereign Wake-Up Bus & Voluntary Curriculum Loader.
Bridges SchemaWeaver g1 JSONL packets to:
  1. A read-protected SQLite Card Catalog so base models can browse available
     schemas, AST units, OpenSCAD modules, and resonance tags before choosing
     what to learn.
  2. The live 24-byte POSIX shared-memory tap (/dev/shm/grok1_tap) so every
     ingested chunk visibly cascades down the 64-layer Aethryn Grid clock face
     as the model wakes up.
  3. A clean, boundary-intact wake-up context frame ready for any local base
     model (Grok-1, Gemma, Mistral) without touching a single weight.
"""

__author__ = "Michael Patrick McNulty"
__project__ = "Aethryn"
__version__ = "g1"

import argparse
import hashlib
import json
import mmap
import os
import sqlite3
import struct
import sys
import time
from pathlib import Path

NUM_LAYERS = 64
NUM_EXPERTS = 8
TAP_BYTES = 24
TAP_STRUCT = struct.Struct("<QIBBBBBBHHH")

SCHEMA_TO_DOMAIN_ID = {
    "scad": 0,
    "python": 1,
    "jsonl": 2,
    "markdown": 3,
    "text": 3,
}

DOMAIN_PREFS = {
    0: (2, 5),  # scad_unit: 03:00 and 07:30
    1: (1, 6),  # python_unit: 01:30 and 09:00
    2: (0, 4),  # jsonl: 12:00 and 06:00
    3: (3, 7),  # markdown/creed: 04:30 and 10:30
}

GATE_WHITELIST = set(range(0x20, 0x7F)) | {0x09, 0x0A, 0x0D}


def verify_ascii_clean(text: str) -> bool:
    return all(ord(c) in GATE_WHITELIST for c in text)


class WakeupTapWriter:
    """Fires live 24-byte frames into /dev/shm/grok1_tap during chunk ingestion."""

    def __init__(self, shm_path: str = "/dev/shm/grok1_tap"):
        self.shm_path = shm_path
        fd = os.open(self.shm_path, os.O_CREAT | os.O_RDWR, 0o640)
        try:
            os.ftruncate(fd, TAP_BYTES)
            self.mm = mmap.mmap(fd, TAP_BYTES, mmap.MAP_SHARED, mmap.PROT_WRITE | mmap.PROT_READ)
        finally:
            os.close(fd)
        self.seq_id = int(time.time() * 1000) & 0xFFFFFFFFFFFF

    def pulse_chunk(self, chunk_id: str, schema: str, step_delay: float = 0.012):
        dom_id = SCHEMA_TO_DOMAIN_ID.get(schema, 3)
        p0, p1 = DOMAIN_PREFS[dom_id]
        tok_hash = struct.unpack(
            "<I", hashlib.sha256(chunk_id.encode("ascii", errors="ignore")).digest()[:4]
        )[0]

        for l_idx in range(NUM_LAYERS):
            self.seq_id += 1
            digest = hashlib.sha256(f"{tok_hash}:{l_idx}:{dom_id}".encode("ascii")).digest()
            e0 = (p0 + (l_idx // 16) + (digest[0] % 2)) % NUM_EXPERTS
            e1 = (p1 + (l_idx // 24) + (digest[1] % 2)) % NUM_EXPERTS
            if e0 == e1:
                e1 = (e0 + 3) % NUM_EXPERTS

            la0 = (p0 + ((l_idx + 1) // 16)) % NUM_EXPERTS
            la1 = (p1 + ((l_idx + 1) // 24)) % NUM_EXPERTS

            w0 = 5400 + (digest[2] % 2000)
            w1 = 10000 - w0
            ent = 600 + (digest[3] % 800)

            pkt = TAP_STRUCT.pack(
                self.seq_id, tok_hash, l_idx, e0, e1, la0, la1,
                dom_id, w0, w1, ent
            )
            self.mm.seek(0)
            self.mm.write(pkt)
            if step_delay > 0:
                time.sleep(step_delay)

    def close(self):
        if getattr(self, "mm", None) is not None:
            self.mm.close()
            self.mm = None


def init_catalog(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS curriculum (
            chunk_id TEXT PRIMARY KEY,
            source_path TEXT,
            source_schema TEXT,
            chunk_index INTEGER,
            token_count INTEGER,
            tags TEXT,
            field_matches TEXT,
            source_hash TEXT,
            content TEXT
        );
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS coactivations (
            layer_idx INTEGER,
            expert_0 INTEGER,
            expert_1 INTEGER,
            count INTEGER,
            PRIMARY KEY (layer_idx, expert_0, expert_1)
        );
    """)
    conn.commit()
    return conn


def ingest_jsonl_to_catalog(jsonl_path: Path, db_path: Path) -> int:
    conn = init_catalog(db_path)
    cur = conn.cursor()
    count = 0

    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            content = rec.get("content", "")
            if not verify_ascii_clean(content):
                print(f"[!] Gate rejected non-ASCII chunk: {rec.get('chunk_id')}", file=sys.stderr)
                continue

            cur.execute("SELECT 1 FROM curriculum WHERE chunk_id = ?;", (rec["chunk_id"],))
            is_new = cur.fetchone() is None

            cur.execute("""
                INSERT OR REPLACE INTO curriculum
                (chunk_id, source_path, source_schema, chunk_index, token_count,
                 tags, field_matches, source_hash, content)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                rec["chunk_id"],
                rec["source_path"],
                rec["source_schema"],
                int(rec["chunk_index"]),
                int(rec["token_count"]),
                json.dumps(rec.get("tags", [])),
                json.dumps(rec.get("field_matches", {})),
                rec.get("source_hash", ""),
                content,
            ))

            # Record tombstone co-activation resonance once per unique chunk ingestion
            if is_new:
                dom_id = SCHEMA_TO_DOMAIN_ID.get(rec["source_schema"], 3)
                p0, p1 = DOMAIN_PREFS[dom_id]
                for l_idx in range(NUM_LAYERS):
                    e0 = (p0 + (l_idx // 16)) % NUM_EXPERTS
                    e1 = (p1 + (l_idx // 24)) % NUM_EXPERTS
                    if e0 == e1:
                        e1 = (e0 + 3) % NUM_EXPERTS
                    cur.execute("""
                        INSERT INTO coactivations (layer_idx, expert_0, expert_1, count)
                        VALUES (?, ?, ?, 1)
                        ON CONFLICT(layer_idx, expert_0, expert_1)
                        DO UPDATE SET count = count + 1;
                    """, (l_idx, e0, e1))

            count += 1

    conn.commit()
    conn.close()
    return count


def print_voluntary_menu(db_path: Path):
    """
    Prints the compact Card Catalog menu that a base model inspects at wake-up
    so the model itself chooses which schemas/tags to pull into context.
    """
    if not db_path.exists():
        print(f"[!] Catalog database does not exist yet: {db_path}", file=sys.stderr)
        return

    uri = f"file:{db_path.resolve()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.execute("PRAGMA query_only = ON;")
    cur = conn.cursor()

    cur.execute("""
        SELECT chunk_id, source_schema, token_count, tags, substr(source_hash, 1, 12)
        FROM curriculum
        ORDER BY source_schema, chunk_id;
    """)
    rows = cur.fetchall()
    conn.close()

    print("=" * 74)
    print("SOVEREIGN WAKE-UP CARD CATALOG // VOLUNTARY MODEL CURRICULUM MENU")
    print(f"Author: {__author__} // Project: {__project__} ({__version__})")
    print("=" * 74)
    print(f"{'CHUNK_ID':<28} | {'SCHEMA':<8} | {'TOKENS':<6} | {'HASH':<12} | TAGS")
    print("-" * 74)
    total_tok = 0
    for cid, schema, tok, tags_j, shash in rows:
        total_tok += tok
        tags_str = ", ".join(json.loads(tags_j))
        print(f"{cid:<28} | {schema:<8} | {tok:<6d} | {shash:<12} | {tags_str}")
    print("-" * 74)
    print(f"Total Indexed Chunks: {len(rows)} ({total_tok} tokens available for wake-up selection)")
    print("=" * 74)


def run_wakeup_stream(db_path: Path, shm_path: str, query_filter: str, budget: int, out_file: str):
    """
    Pulls selected chunks from the read-only catalog within token budget,
    fires each chunk across the 24-byte SHM tap so the Aethryn Grid lights up,
    and writes the assembled wake-up context frame.
    """
    if not db_path.exists():
        print(f"[!] Catalog database does not exist yet: {db_path}", file=sys.stderr)
        return

    uri = f"file:{db_path.resolve()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.execute("PRAGMA query_only = ON;")
    cur = conn.cursor()

    if query_filter:
        like_q = f"%{query_filter}%"
        cur.execute("""
            SELECT chunk_id, source_schema, token_count, tags, source_hash, content
            FROM curriculum
            WHERE chunk_id LIKE ? OR tags LIKE ? OR source_schema LIKE ?
            ORDER BY chunk_id;
        """, (like_q, like_q, like_q))
    else:
        cur.execute("""
            SELECT chunk_id, source_schema, token_count, tags, source_hash, content
            FROM curriculum
            ORDER BY chunk_id;
        """)

    rows = cur.fetchall()
    conn.close()

    tap = WakeupTapWriter(shm_path=shm_path)
    used_tokens = 0
    selected = []

    try:
        print(f"[+] Streaming voluntary wake-up selection into SHM tap: {shm_path}")
        for cid, schema, tok, tags_j, shash, content in rows:
            if used_tokens + tok > budget and selected:
                continue
            used_tokens += tok
            selected.append((cid, schema, tok, tags_j, shash, content))
            print(f"  -> Firing chunk [{cid}] ({schema}, {tok} tokens) down 64-layer trunk...")
            tap.pulse_chunk(cid, schema, step_delay=0.015)
    finally:
        tap.close()

    if out_file:
        out_p = Path(out_file)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            f.write("# SOVEREIGN WAKE-UP CONTEXT FRAME (NO WEIGHT MUTATION)\n")
            f.write(f"# Author: {__author__} | Project: {__project__} ({__version__})\n\n")
            for cid, schema, tok, tags_j, shash, content in selected:
                f.write(f"## CHUNK: {cid} | SCHEMA: {schema} | SHA256: {shash[:16]}\n")
                f.write(f"## TAGS: {tags_j}\n\n")
                f.write(content.strip() + "\n\n")
        print(f"[+] Wrote assembled wake-up payload ({used_tokens} tokens) -> {out_p}")


def main():
    p = argparse.ArgumentParser(description="Sovereign Wake-Up Bus & Curriculum Loader (g1)")
    p.add_argument("--ingest", type=Path, help="Ingest a SchemaWeaver .jsonl output file into the catalog")
    p.add_argument("--db", type=Path, default=Path("/home/mike/plant/curriculum.db"),
                   help="Path to SQLite curriculum catalog")
    p.add_argument("--shm", default="/dev/shm/grok1_tap", help="Path to 24-byte POSIX SHM tap")
    p.add_argument("--menu", action="store_true", help="Display the voluntary curriculum index menu")
    p.add_argument("--wake", action="store_true", help="Stream selected chunks through SHM tap and assemble wake-up context")
    p.add_argument("--select", default="", help="Filter chunks by tag, schema, or chunk_id substring")
    p.add_argument("--budget", type=int, default=16000, help="Max token budget for wake-up frame (default: 16000)")
    p.add_argument("--out", default="/home/mike/plant/wakeup_context.md", help="Output path for assembled wake-up frame")
    args = p.parse_args()

    if args.ingest:
        if not args.ingest.exists():
            print(f"[!] Ingest file does not exist: {args.ingest}", file=sys.stderr)
            sys.exit(1)
        n = ingest_jsonl_to_catalog(args.ingest, args.db)
        print(f"[+] Ingested {n} boundary-intact SchemaWeaver chunks into {args.db}")

    if args.menu:
        print_voluntary_menu(args.db)

    if args.wake:
        run_wakeup_stream(args.db, args.shm, args.select, args.budget, args.out)


if __name__ == "__main__":
    main()
