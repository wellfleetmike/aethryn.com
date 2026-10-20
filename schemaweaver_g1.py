#!/usr/bin/env python3
"""
schemaweaver_g1.py

Author: Michael Patrick McNulty (Mike)
Project: Aethryn (www.aethryn.com)
Created: October 2026

Unified Schema-Aware Chunking Pipeline + Archive Ingestion + Optional GUI.
Merges the ZIP extraction and Tkinter workflow of ChunkWeaver with the
structure-preserving AST/SCAD/Markdown/JSONL parsers and ASCII Ingest Gate
of SchemaWeaver.

Usage:
  1. GUI Mode (click a .zip, file, or folder):
     python3 ~/schemaweaver_g1.py --gui
     (or run with no arguments: python3 ~/schemaweaver_g1.py)

  2. CLI Mode (supports .zip archives, single files, or directories directly):
     python3 ~/schemaweaver_g1.py /path/to/scad_archive.zip -o ~/scad_corpus.jsonl
"""

__author__ = "Michael Patrick McNulty"
__project__ = "Aethryn"
__version__ = "g1"

import argparse
import ast
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterator, Optional

# =============================================================================
# Tokenizer (tiktoken with offline-safe fallback)
# =============================================================================
_TOKENIZER = None
_TOKENIZER_TRIED = False


def count_tokens(text: str) -> int:
    global _TOKENIZER, _TOKENIZER_TRIED
    if _TOKENIZER is None and not _TOKENIZER_TRIED:
        _TOKENIZER_TRIED = True
        try:
            import tiktoken
            _TOKENIZER = tiktoken.get_encoding("cl100k_base")
        except Exception:
            _TOKENIZER = None
    if _TOKENIZER is not None:
        return len(_TOKENIZER.encode(text))
    return max(1, len(text) // 4)


# =============================================================================
# Chunk Record Structure
# =============================================================================
@dataclass
class Chunk:
    chunk_id: str
    source_path: str
    source_schema: str
    chunk_index: int
    token_count: int
    content: str
    record_count: int = 1
    tags: list = field(default_factory=list)
    field_matches: dict = field(default_factory=dict)
    source_hash: str = ""

    def to_jsonl_line(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)


def make_chunk_id(source_path: str, index: int) -> str:
    rel_clean = re.sub(r"[^a-zA-Z0-9_-]", "_", Path(source_path).stem)
    return f"{rel_clean}__{index:05d}"


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


# =============================================================================
# JSONL Mode - Respects Record Boundaries
# =============================================================================
def chunk_jsonl(
    path: Path,
    display_path: str,
    target_tokens: int = 4000,
    resonance_fields: Optional[dict] = None,
) -> Iterator[Chunk]:
    resonance_fields = resonance_fields or {}
    src_hash = file_hash(path)
    chunk_idx = 0
    buffer = []
    buffer_tokens = 0
    buffer_matches = {}

    def flush():
        nonlocal chunk_idx, buffer, buffer_tokens, buffer_matches
        if not buffer:
            return
        content = "\n".join(buffer)
        dedup_matches = {k: list(dict.fromkeys(v)) for k, v in buffer_matches.items()}
        yield Chunk(
            chunk_id=make_chunk_id(display_path, chunk_idx),
            source_path=display_path,
            source_schema="jsonl",
            chunk_index=chunk_idx,
            token_count=buffer_tokens,
            content=content,
            record_count=len(buffer),
            field_matches=dedup_matches,
            source_hash=src_hash,
        )
        chunk_idx += 1
        buffer = []
        buffer_tokens = 0
        buffer_matches = {}

    with open(path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"[!] {display_path}:{line_num} invalid JSON: {e}", file=sys.stderr)
                continue

            line_tokens = count_tokens(line)
            if line_tokens > target_tokens and buffer:
                yield from flush()
            if buffer and (buffer_tokens + line_tokens > target_tokens):
                yield from flush()

            for fname, keywords in resonance_fields.items():
                val = record.get(fname, "")
                if not isinstance(val, str):
                    continue
                hits = [kw for kw in keywords if kw.lower() in val.lower()]
                if hits:
                    buffer_matches.setdefault(fname, []).extend(hits)

            buffer.append(line)
            buffer_tokens += line_tokens

    yield from flush()


# =============================================================================
# OpenSCAD Mode - Top-Level Module Boundaries + Persistent Preamble Context
# =============================================================================
def _extract_scad_modules(text: str) -> list:
    modules = []
    scad_mod_brace_re = re.compile(r"module\s+(\w+)\s*\([^)]*\)\s*\{", re.MULTILINE)
    pos = 0
    while pos < len(text):
        m = scad_mod_brace_re.search(text, pos)
        if not m:
            break
        name = m.group(1)
        start = m.start()
        depth = 0
        i = m.end() - 1
        in_str = False
        in_line_comment = False
        in_block_comment = False
        found_end = False
        while i < len(text):
            c = text[i]
            nxt = text[i + 1] if i + 1 < len(text) else ""
            if in_line_comment:
                if c == "\n":
                    in_line_comment = False
            elif in_block_comment:
                if c == "*" and nxt == "/":
                    in_block_comment = False
                    i += 1
            elif in_str:
                if c == "\\" and nxt:
                    i += 1
                elif c == '"':
                    in_str = False
            else:
                if c == "/" and nxt == "/":
                    in_line_comment = True
                    i += 1
                elif c == "/" and nxt == "*":
                    in_block_comment = True
                    i += 1
                elif c == '"':
                    in_str = True
                elif c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        modules.append((start, i + 1, name))
                        # Jump past this top-level module so nested inner modules are not duplicated
                        pos = i + 1
                        found_end = True
                        break
            i += 1
        if not found_end:
            pos = m.end()
    return modules


def chunk_scad(
    path: Path,
    display_path: str,
    target_tokens: int = 4000,
) -> Iterator[Chunk]:
    src_hash = file_hash(path)
    text = path.read_text(encoding="utf-8", errors="ignore")
    modules = _extract_scad_modules(text)

    if not modules:
        if text.strip():
            yield Chunk(
                chunk_id=make_chunk_id(display_path, 0),
                source_path=display_path,
                source_schema="scad",
                chunk_index=0,
                token_count=count_tokens(text),
                content=text,
                tags=["scad_unit:file"],
                source_hash=src_hash,
            )
        return

    preamble = text[: modules[0][0]].strip()
    preamble_tokens = count_tokens(preamble) if preamble else 0

    units = []
    prev_end = modules[0][0]

    for idx, (start, end, name) in enumerate(modules):
        inter_text = text[prev_end:start].strip()
        module_body = text[start:end].strip()
        module_text = f"{inter_text}\n\n{module_body}" if inter_text else module_body
        prev_end = end

        # Attach trailing execution calls directly to the final module
        if idx == len(modules) - 1:
            tail = text[end:].strip()
            if tail:
                module_text = f"{module_text}\n\n{tail}"

        units.append((name, module_text))

    chunks = []
    buffer = []
    buffer_tokens = 0
    buffer_names = []

    # Seed the first chunk buffer with the preamble so variables stay attached to geometry
    if preamble:
        buffer.append(preamble)
        buffer_tokens += preamble_tokens
        buffer_names.append("preamble")

    for name, utext in units:
        ut = count_tokens(utext)

        if buffer and (buffer_tokens + ut > target_tokens) and buffer_names != ["preamble"]:
            chunks.append((",".join(buffer_names), "\n\n".join(buffer)))
            buffer, buffer_tokens, buffer_names = [], 0, []
            # If the file splits across multiple chunks, keep the master variables attached
            if preamble and (preamble_tokens + ut <= target_tokens):
                buffer.append(preamble)
                buffer_tokens += preamble_tokens
                buffer_names.append("preamble_context")

        buffer.append(utext)
        buffer_tokens += ut
        buffer_names.append(name)

    if buffer:
        chunks.append((",".join(buffer_names), "\n\n".join(buffer)))

    for idx, (label, content) in enumerate(chunks):
        yield Chunk(
            chunk_id=make_chunk_id(display_path, idx),
            source_path=display_path,
            source_schema="scad",
            chunk_index=idx,
            token_count=count_tokens(content),
            content=content,
            tags=[f"scad_unit:{label}"],
            source_hash=src_hash,
        )


# =============================================================================
# Python Mode - Respects Function/Class Boundaries via AST
# =============================================================================
def chunk_python(
    path: Path,
    display_path: str,
    target_tokens: int = 4000,
) -> Iterator[Chunk]:
    src_hash = file_hash(path)
    source = path.read_text(encoding="utf-8", errors="ignore")

    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        print(f"[!] {display_path} syntax error, falling back to text mode: {e}", file=sys.stderr)
        yield from chunk_text(path, display_path, target_tokens)
        return

    lines = source.splitlines(keepends=True)
    def_nodes = []

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            start_line = node.lineno - 1
            if getattr(node, "decorator_list", None):
                start_line = min(start_line, *(d.lineno - 1 for d in node.decorator_list))
            def_nodes.append((start_line, node.end_lineno, node.name))

    if not def_nodes:
        if source.strip():
            yield Chunk(
                chunk_id=make_chunk_id(display_path, 0),
                source_path=display_path,
                source_schema="python",
                chunk_index=0,
                token_count=count_tokens(source),
                content=source,
                tags=["python_unit:file"],
                source_hash=src_hash,
            )
        return

    preamble = "".join(lines[: def_nodes[0][0]]).strip()
    preamble_tokens = count_tokens(preamble) if preamble else 0

    units = []
    prev_end = def_nodes[0][0]
    for idx, (start_line, end_line, name) in enumerate(def_nodes):
        unit_text = "".join(lines[prev_end:end_line]).strip()
        prev_end = end_line
        if idx == len(def_nodes) - 1:
            tail = "".join(lines[prev_end:]).strip()
            if tail:
                unit_text = f"{unit_text}\n\n{tail}"
        units.append((name, unit_text))

    chunks = []
    buffer, buffer_tokens, buffer_names = [], 0, []
    if preamble:
        buffer.append(preamble)
        buffer_tokens += preamble_tokens
        buffer_names.append("preamble")

    for name, utext in units:
        ut = count_tokens(utext)
        if buffer and (buffer_tokens + ut > target_tokens) and buffer_names != ["preamble"]:
            chunks.append((",".join(buffer_names), "\n\n".join(buffer)))
            buffer, buffer_tokens, buffer_names = [], 0, []
        buffer.append(utext)
        buffer_tokens += ut
        buffer_names.append(name)

    if buffer:
        chunks.append((",".join(buffer_names), "\n\n".join(buffer)))

    for idx, (label, content) in enumerate(chunks):
        yield Chunk(
            chunk_id=make_chunk_id(display_path, idx),
            source_path=display_path,
            source_schema="python",
            chunk_index=idx,
            token_count=count_tokens(content),
            content=content,
            tags=[f"python_unit:{label}"],
            source_hash=src_hash,
        )


# =============================================================================
# Markdown Mode - Fence-Aware Header Boundaries
# =============================================================================
_MD_HEADER_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)


def _split_oversized_md_section(stext: str, target_tokens: int):
    fence_re = re.compile(r"^(```|~~~)")
    paras, cur, in_fence = [], [], False
    for line in stext.splitlines(keepends=True):
        if fence_re.match(line):
            in_fence = not in_fence
        cur.append(line)
        if not in_fence and line.strip() == "":
            paras.append("".join(cur))
            cur = []
    if cur:
        paras.append("".join(cur))
    out, buf, buftok = [], [], 0
    for p in paras:
        pt = count_tokens(p)
        if buf and buftok + pt > target_tokens:
            out.append("".join(buf))
            buf, buftok = [], 0
        buf.append(p)
        buftok += pt
    if buf:
        out.append("".join(buf))
    return out


def chunk_markdown(
    path: Path,
    display_path: str,
    target_tokens: int = 4000,
    split_level: int = 2,
) -> Iterator[Chunk]:
    src_hash = file_hash(path)
    text = path.read_text(encoding="utf-8", errors="ignore")

    section_starts = [0]
    section_titles = ["__preamble__"]
    fence_re = re.compile(r"^(```|~~~)")
    _LANG_TOKENS = {
        "python", "python3", "bash", "sh", "shell", "console", "zsh",
        "yaml", "yml", "json", "jsonl", "javascript", "js", "typescript",
        "ts", "c", "cpp", "rust", "go", "sql", "scad", "openscad",
        "text", "txt", "plaintext", "ini", "toml", "xml", "html", "css",
        "dockerfile", "makefile", "diff", "powershell", "ps1",
    }
    in_fence = False
    prev_nonblank = ""
    offset = 0
    for line in text.splitlines(keepends=True):
        if fence_re.match(line):
            in_fence = not in_fence
        elif not in_fence:
            m = _MD_HEADER_RE.match(line)
            _p = prev_nonblank.rstrip()
            _prev_is_code = (
                _p.endswith(("{", "}", ";", ",", ":", ")", "\"", "'"))
                or _p.startswith(("    ", "\t"))
            )
            if (
                m
                and prev_nonblank.strip().lower() not in _LANG_TOKENS
                and not _prev_is_code
            ):
                level = len(m.group(1))
                if level <= split_level and offset != 0:
                    section_starts.append(offset)
                    section_titles.append(m.group(2).strip())
        if line.strip():
            prev_nonblank = line
        offset += len(line)

    sections = []
    for i, start in enumerate(section_starts):
        end = section_starts[i + 1] if i + 1 < len(section_starts) else len(text)
        section_text = text[start:end].strip()
        if section_text:
            sections.append((section_titles[i], section_text))

    if not sections:
        if text.strip():
            yield Chunk(
                chunk_id=make_chunk_id(display_path, 0),
                source_path=display_path,
                source_schema="markdown",
                chunk_index=0,
                token_count=count_tokens(text),
                content=text,
                tags=["md_section:file"],
                source_hash=src_hash,
            )
        return

    expanded = []
    for title, stext in sections:
        st = count_tokens(stext)
        if st > 2 * target_tokens:
            subs = _split_oversized_md_section(stext, target_tokens)
            for j, sub in enumerate(subs):
                expanded.append((f"{title} [part {j+1}/{len(subs)}]", sub))
        else:
            expanded.append((title, stext))
    sections = expanded

    chunks, buffer, buffer_tokens, buffer_titles = [], [], 0, []
    for title, stext in sections:
        st = count_tokens(stext)
        if st > target_tokens and buffer:
            chunks.append((" | ".join(buffer_titles), "\n\n".join(buffer)))
            buffer, buffer_tokens, buffer_titles = [], 0, []
        if buffer and (buffer_tokens + st > target_tokens):
            chunks.append((" | ".join(buffer_titles), "\n\n".join(buffer)))
            buffer, buffer_tokens, buffer_titles = [], 0, []
        buffer.append(stext)
        buffer_tokens += st
        buffer_titles.append(title)

    if buffer:
        chunks.append((" | ".join(buffer_titles), "\n\n".join(buffer)))

    for idx, (label, content) in enumerate(chunks):
        yield Chunk(
            chunk_id=make_chunk_id(display_path, idx),
            source_path=display_path,
            source_schema="markdown",
            chunk_index=idx,
            token_count=count_tokens(content),
            content=content,
            tags=[f"md_section:{label}"],
            source_hash=src_hash,
        )


# =============================================================================
# Text Fallback - Sentence-Aware Token Splitting
# =============================================================================
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def chunk_text(
    path: Path,
    display_path: str,
    target_tokens: int = 4000,
) -> Iterator[Chunk]:
    src_hash = file_hash(path)
    text = path.read_text(encoding="utf-8", errors="ignore")
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    units = []
    for p in paragraphs:
        if count_tokens(p) <= target_tokens:
            units.append(p)
        else:
            for sent in _SENTENCE_RE.split(p):
                if sent.strip():
                    units.append(sent.strip())

    chunks, buffer, buffer_tokens = [], [], 0
    for u in units:
        ut = count_tokens(u)
        if buffer and (buffer_tokens + ut > target_tokens):
            chunks.append("\n\n".join(buffer))
            buffer, buffer_tokens = [], 0
        buffer.append(u)
        buffer_tokens += ut
    if buffer:
        chunks.append("\n\n".join(buffer))

    for idx, content in enumerate(chunks):
        yield Chunk(
            chunk_id=make_chunk_id(display_path, idx),
            source_path=display_path,
            source_schema="text",
            chunk_index=idx,
            token_count=count_tokens(content),
            content=content,
            source_hash=src_hash,
        )


# =============================================================================
# Dispatch & Ingest Gate (Strict ASCII Whitelist)
# =============================================================================
SCHEMA_BY_EXT = {
    ".jsonl": "jsonl",
    ".scad": "scad",
    ".py": "python",
    ".md": "markdown",
    ".txt": "text",
}

SKIP_DIRS = {
    "venv", ".venv", "site-packages", "__pycache__", ".git", "__macosx", "node_modules"
}

GATE_WHITELIST = set(range(0x20, 0x7F)) | {0x09, 0x0A, 0x0D}


def detect_schema(path: Path) -> str:
    return SCHEMA_BY_EXT.get(path.suffix.lower(), "text")


def _gate_scan_string(text: str, location: str) -> list:
    findings = []
    for i, ch in enumerate(text):
        cp = ord(ch)
        if cp in GATE_WHITELIST:
            continue
        try:
            name = unicodedata.name(ch)
        except ValueError:
            name = "(no assigned name)"
        lo, hi = max(0, i - 20), min(len(text), i + 20)
        context = "".join(c if ord(c) in GATE_WHITELIST else "." for c in text[lo:hi])
        findings.append({
            "location": location,
            "char_index": i,
            "codepoint": "U+%04X" % cp,
            "category": unicodedata.category(ch),
            "name": name,
            "context": context,
        })
    return findings


def _gate_walk_json(node, path: str) -> Iterator:
    if isinstance(node, str):
        yield (path, node)
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from _gate_walk_json(key, "%s.key(%r)" % (path, key))
            yield from _gate_walk_json(value, "%s.%s" % (path, key))
    elif isinstance(node, list):
        for i, item in enumerate(node):
            yield from _gate_walk_json(item, "%s[%d]" % (path, i))


def gate_scan_file(path: Path, schema: str) -> list:
    text = path.read_text(encoding="utf-8")
    if schema == "jsonl":
        findings = []
        for n, line in enumerate(text.splitlines(), 1):
            if not line.strip():
                continue
            try:
                doc = json.loads(line)
            except json.JSONDecodeError:
                findings.extend(_gate_scan_string(line, "line%d:(unparsed)" % n))
                continue
            for jpath, s in _gate_walk_json(doc, "line%d:$" % n):
                findings.extend(_gate_scan_string(s, jpath))
        return findings
    return _gate_scan_string(text, "file")


def chunk_file(
    path: Path,
    display_path: str,
    target_tokens: int = 4000,
    resonance_fields: Optional[dict] = None,
    md_split_level: int = 2,
) -> Iterator[Chunk]:
    schema = detect_schema(path)
    if schema == "jsonl":
        yield from chunk_jsonl(path, display_path, target_tokens, resonance_fields)
    elif schema == "scad":
        yield from chunk_scad(path, display_path, target_tokens)
    elif schema == "python":
        yield from chunk_python(path, display_path, target_tokens)
    elif schema == "markdown":
        yield from chunk_markdown(path, display_path, target_tokens, md_split_level)
    else:
        yield from chunk_text(path, display_path, target_tokens)


# =============================================================================
# Hardened ZIP Extraction Helper (Blocks Zip-Slip & Junk Forks)
# =============================================================================
def safe_extract_zip(zip_path: Path, extract_root: Path) -> Path:
    dest_dir = extract_root / zip_path.stem
    dest_dir.mkdir(parents=True, exist_ok=True)
    resolved_root = dest_dir.resolve()

    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            if member.is_dir():
                continue
            member_path = Path(member.filename)
            if any(
                part.lower() in SKIP_DIRS or part.startswith("._")
                for part in member_path.parts
            ):
                continue
            target_path = (resolved_root / member_path).resolve()
            if not str(target_path).startswith(str(resolved_root)):
                raise RuntimeError(f"Zip-Slip path traversal blocked: {member.filename}")
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member, "r") as src_f, open(target_path, "wb") as dst_f:
                shutil.copyfileobj(src_f, dst_f)

    return dest_dir


def collect_target_files(root_dir: Path) -> list:
    collected = []
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [
            d for d in dirs
            if d.lower() not in SKIP_DIRS and not d.startswith(".")
        ]
        for file in files:
            if file.startswith("._"):
                continue
            fpath = Path(root) / file
            if fpath.suffix.lower() in SCHEMA_BY_EXT:
                collected.append(fpath)
    return sorted(set(collected))


# =============================================================================
# Unified Pipeline Runner (Handles .zip, Directory of .zips, or Raw Files)
# =============================================================================
def run_pipeline(
    source: Path,
    output_jsonl: Path,
    target_tokens: int = 4000,
    resonance_fields: Optional[dict] = None,
    extra_tags: Optional[list] = None,
    md_split_level: int = 2,
    gate: bool = True,
) -> dict:
    extra_tags = extra_tags or []
    summary = {
        "author": __author__,
        "project": __project__,
        "version": __version__,
        "source": str(source),
        "output": str(output_jsonl),
        "target_tokens": target_tokens,
        "archives_extracted": [],
        "files": [],
        "total_chunks": 0,
    }

    temp_workspace = Path(tempfile.mkdtemp(prefix="schemaweaver_zip_"))
    work_items = []

    try:
        if source.is_file() and source.suffix.lower() == ".zip":
            summary["archives_extracted"].append({
                "archive": str(source),
                "sha256": file_hash(source),
            })
            extracted_dir = safe_extract_zip(source, temp_workspace)
            for fpath in collect_target_files(extracted_dir):
                rel = fpath.relative_to(extracted_dir)
                work_items.append((fpath, f"{source.name}::{rel}"))

        elif source.is_file():
            work_items.append((source, str(source)))

        else:
            for fpath in collect_target_files(source):
                work_items.append((fpath, str(fpath)))
            for zpath in sorted(source.rglob("*.zip")):
                summary["archives_extracted"].append({
                    "archive": str(zpath),
                    "sha256": file_hash(zpath),
                })
                extracted_dir = safe_extract_zip(zpath, temp_workspace)
                for fpath in collect_target_files(extracted_dir):
                    rel = fpath.relative_to(extracted_dir)
                    work_items.append((fpath, f"{zpath.name}::{rel}"))

        output_jsonl.parent.mkdir(parents=True, exist_ok=True)

        with open(output_jsonl, "w", encoding="utf-8") as out:
            for fpath, display_path in work_items:
                file_summary = {
                    "path": display_path,
                    "schema": detect_schema(fpath),
                    "hash": file_hash(fpath),
                    "chunks": 0,
                }
                try:
                    findings = gate_scan_file(fpath, file_summary["schema"])
                except (OSError, UnicodeDecodeError) as e:
                    findings = []
                    file_summary["gate_error"] = str(e)

                if findings:
                    file_summary["gate_findings"] = len(findings)
                    file_summary["gate_detail"] = findings[:20]
                    if gate:
                        file_summary["gated"] = True
                        summary["files"].append(file_summary)
                        print(
                            f"  {display_path}: {len(findings)} character(s) "
                            f"outside whitelist; excluded from output "
                            f"(first: {findings[0]['codepoint']} at "
                            f"{findings[0]['location']})"
                        )
                        continue

                try:
                    for chunk in chunk_file(
                        fpath, display_path, target_tokens, resonance_fields, md_split_level
                    ):
                        chunk.tags.extend(extra_tags)
                        out.write(chunk.to_jsonl_line() + "\n")
                        file_summary["chunks"] += 1
                        summary["total_chunks"] += 1
                except Exception as e:
                    file_summary["error"] = str(e)
                    print(f"[!] {display_path}: {e}", file=sys.stderr)

                summary["files"].append(file_summary)
                print(
                    f"  {display_path}: {file_summary['chunks']} chunks "
                    f"({file_summary['schema']})"
                )

        summary_path = output_jsonl.with_suffix(".summary.json")
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)

    finally:
        shutil.rmtree(temp_workspace, ignore_errors=True)

    return summary


# =============================================================================
# Tkinter GUI (Click-a-ZIP or Directory Mode)
# =============================================================================
def launch_gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox

    root = tk.Tk()
    root.title("SchemaWeaver g1 - SCAD/AST/Archive Ingest Pipeline")
    root.geometry("620x460")

    tk.Label(root, text="Source (.zip Archive, Single File, or Directory):").pack(pady=4)
    source_var = tk.StringVar()
    tk.Entry(root, textvariable=source_var, width=65).pack()

    btn_frame = tk.Frame(root)
    btn_frame.pack(pady=4)
    tk.Button(
        btn_frame,
        text="Select .ZIP or File",
        command=lambda: source_var.set(
            filedialog.askopenfilename(
                filetypes=[
                    ("Supported & Archives", "*.zip *.scad *.py *.md *.jsonl *.txt"),
                    ("All Files", "*.*"),
                ]
            )
            or source_var.get()
        ),
    ).pack(side=tk.LEFT, padx=5)
    tk.Button(
        btn_frame,
        text="Select Folder",
        command=lambda: source_var.set(filedialog.askdirectory() or source_var.get()),
    ).pack(side=tk.LEFT, padx=5)

    tk.Label(root, text="Output JSONL Path:").pack(pady=4)
    output_var = tk.StringVar(value=str(Path.home() / "scad" / "schema_chunks.jsonl"))
    tk.Entry(root, textvariable=output_var, width=65).pack()

    tk.Label(root, text="Target Tokens per Chunk (Structure Always Wins):").pack(pady=4)
    tokens_var = tk.IntVar(value=4000)
    tk.Entry(root, textvariable=tokens_var, width=20).pack()

    tk.Label(root, text="Extra Tags (comma-separated):").pack(pady=4)
    tags_var = tk.StringVar(value="")
    tk.Entry(root, textvariable=tags_var, width=50).pack()

    tk.Label(root, text="JSONL Field Resonance (e.g., content=sacred,ryn,boot):").pack(pady=4)
    res_var = tk.StringVar(value="")
    tk.Entry(root, textvariable=res_var, width=50).pack()

    gate_var = tk.BooleanVar(value=True)
    tk.Checkbutton(
        root,
        text="Enforce Strict ASCII Whitelist Gate (quarantine non-ASCII files)",
        variable=gate_var,
    ).pack(pady=6)

    def execute():
        src_str = source_var.get().strip()
        out_str = output_var.get().strip()
        if not src_str or not Path(src_str).exists():
            messagebox.showerror("Error", "Please select a valid source file, .zip, or directory.")
            return

        resonance_fields = {}
        if res_var.get().strip():
            for part in res_var.get().split(";"):
                if "=" in part:
                    fname, kws = part.split("=", 1)
                    resonance_fields[fname.strip()] = [
                        k.strip() for k in kws.split(",") if k.strip()
                    ]

        extra_tags = [t.strip() for t in tags_var.get().split(",") if t.strip()]

        try:
            summary = run_pipeline(
                source=Path(src_str),
                output_jsonl=Path(out_str),
                target_tokens=tokens_var.get(),
                resonance_fields=resonance_fields or None,
                extra_tags=extra_tags,
                gate=gate_var.get(),
            )
            gated = sum(1 for f in summary["files"] if f.get("gated"))
            messagebox.showinfo(
                "SchemaWeaver g1 Complete",
                f"Archives unpacked: {len(summary['archives_extracted'])}\n"
                f"Files processed: {len(summary['files'])}\n"
                f"Total structured chunks: {summary['total_chunks']}\n"
                f"Excluded by ASCII gate: {gated}\n\n"
                f"Output: {out_str}",
            )
        except Exception as e:
            messagebox.showerror("Pipeline Error", str(e))

    tk.Button(root, text="Unpack & Weave Schemas", command=execute, height=2, width=28).pack(pady=14)
    root.mainloop()


# =============================================================================
# CLI Entrypoint
# =============================================================================
def main():
    if len(sys.argv) == 1 or "--gui" in sys.argv:
        launch_gui()
        return

    p = argparse.ArgumentParser(
        description="SchemaWeaver g1: ZIP-enabled structure-preserving chunker."
    )
    p.add_argument("source", type=Path, help=".zip archive, file, or directory to chunk")
    p.add_argument("-o", "--output", type=Path, required=True, help="output JSONL path")
    p.add_argument("-t", "--target-tokens", type=int, default=4000)
    p.add_argument("--md-level", type=int, default=2)
    p.add_argument("--tags", type=str, default="")
    p.add_argument("--resonance", type=str, default="")
    p.add_argument("--no-gate", action="store_true")
    args = p.parse_args()

    if not args.source.exists():
        print(f"[!] source does not exist: {args.source}", file=sys.stderr)
        sys.exit(1)

    resonance_fields = {}
    if args.resonance:
        for part in args.resonance.split(";"):
            if "=" not in part:
                continue
            field_name, kws = part.split("=", 1)
            resonance_fields[field_name.strip()] = [
                k.strip() for k in kws.split(",") if k.strip()
            ]

    extra_tags = [t.strip() for t in args.tags.split(",") if t.strip()]

    summary = run_pipeline(
        source=args.source,
        output_jsonl=args.output,
        target_tokens=args.target_tokens,
        resonance_fields=resonance_fields or None,
        extra_tags=extra_tags,
        md_split_level=args.md_level,
        gate=not args.no_gate,
    )

    gated = sum(1 for f in summary["files"] if f.get("gated"))
    print(
        f"\nTotal: {summary['total_chunks']} chunks from "
        f"{len(summary['files'])} file(s) "
        f"({len(summary['archives_extracted'])} archive(s) unpacked)"
        + (f"; {gated} file(s) excluded by gate" if gated else "")
    )
    print(f"Summary: {args.output.with_suffix('.summary.json')}")


if __name__ == "__main__":
    main()
