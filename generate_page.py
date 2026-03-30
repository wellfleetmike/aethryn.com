#!/usr/bin/env python3
"""
Aethryn Navigator — Conversation Page Generator

Parses markdown/text files with speaker-labeled conversation and outputs
a complete HTML page wrapped in the Netscape Navigator chrome.

Speaker formats supported:
  - "Mike: text"
  - "**Mike:** text"
  - "MIKE: text"
  - "[MIKE]: text"

Usage:
  1. Edit the CONFIG dict below
  2. Run: python3 generate_page.py
  3. Output HTML is written to CONFIG['output']
"""

import re
import html
import sys
import os

# ============================================================
# CONFIGURATION — Edit this for each page you generate
# ============================================================

CONFIG = {
    'title': 'Page Title',
    'date': 'Mar 29, 2026',
    'participants': 'Claude, Mike',
    'source': 'source_file.md',
    'output': 'output_file.html',
    'url_path': '/output_file.html',
    'messages_per_page': 20,
}

# ============================================================
# SPEAKER COLORS AND CLASSES
# ============================================================

SPEAKERS = {
    'mike':    {'class': 'mike',    'color': '#006400', 'bg': '#e8f5e9', 'border': '#006400'},
    'claude':  {'class': 'claude',  'color': '#000080', 'bg': '#e3f2fd', 'border': '#000080'},
    'grok':    {'class': 'grok',    'color': '#8B4513', 'bg': '#f0e6d3', 'border': '#8B4513'},
    'gpt':     {'class': 'gpt',     'color': '#e65100', 'bg': '#fff8e0', 'border': '#ff9800'},
    'ryn':     {'class': 'ryn',     'color': '#800080', 'bg': '#f3e5f5', 'border': '#800080'},
    'system':  {'class': 'system',  'color': '#666',    'bg': '#f5f5f5', 'border': '#808080'},
    'nano':    {'class': 'nano',    'color': '#2e7d32', 'bg': '#e8f5e9', 'border': '#2e7d32'},
}

DEFAULT_SPEAKER = {'class': 'unknown', 'color': '#333', 'bg': '#f9f9f9', 'border': '#999'}

# ============================================================
# SVG LOGO (Aethryn "A" mark)
# ============================================================

LOGO_SVG = '''<svg viewBox="0 0 200 200">
          <defs>
            <linearGradient id="bgSmall" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#1E90FF"/>
              <stop offset="100%" stop-color="#000080"/>
            </linearGradient>
          </defs>
          <rect width="200" height="200" fill="url(#bgSmall)" />
          <path d="M0 140 Q100 100 200 140 V200 H0 Z" fill="black"/>
          <text x="50%" y="65%" text-anchor="middle" font-size="140" font-family="Times New Roman, Georgia, serif" fill="white">A</text>
        </svg>'''

# ============================================================
# PARSER
# ============================================================

# Matches lines like:
#   Mike: text
#   **Mike:** text
#   MIKE: text
#   [MIKE]: text
#   GPT (Madmartigan): text
#   Claude (Architect-Mirror): text
SPEAKER_RE = re.compile(
    r'^(?:'
    r'\*\*(\w[\w\s]*?):\*\*'                     # **Speaker:** format
    r'|'
    r'\[(\w[\w\s]*?)\]:'                          # [SPEAKER]: format
    r'|'
    r'(\w+(?:\s*\([^)]+\))?):'                    # Speaker: or Speaker (Role): format
    r')\s*(.*)',
    re.DOTALL
)

# Known speaker names for validation (prevents false positives on random colons)
KNOWN_SPEAKERS = {
    'mike', 'claude', 'grok', 'gpt', 'ryn', 'system', 'nano',
    'madmartigan', 'edge-walker', 'architect-mirror', 'sovereign node',
}


def normalize_speaker(raw_name):
    """Extract the base speaker identity from a raw name string."""
    name = raw_name.strip().lower()

    # Handle parenthetical role names: "GPT (Madmartigan)" -> gpt
    paren_match = re.match(r'(\w+)\s*\(', name)
    if paren_match:
        name = paren_match.group(1)

    # Map aliases
    aliases = {
        'madmartigan': 'gpt',
        'edge-walker': 'grok',
        'architect-mirror': 'claude',
        'sovereign node': 'ryn',
    }

    return aliases.get(name, name)


def is_likely_speaker(raw_name):
    """Check if a colon-preceded word is actually a speaker label."""
    name = raw_name.strip().lower()
    # Direct match
    if name in KNOWN_SPEAKERS:
        return True
    # Parenthetical match: "GPT (Madmartigan)"
    paren_match = re.match(r'(\w+)\s*\(', name)
    if paren_match and paren_match.group(1) in KNOWN_SPEAKERS:
        return True
    return False


def parse_conversation(text):
    """Parse conversation text into a list of (speaker_key, display_name, content) tuples."""
    messages = []
    current_speaker = None
    current_display = None
    current_lines = []

    for line in text.split('\n'):
        stripped = line.strip()

        # Skip empty lines between messages (but preserve them inside messages)
        if not stripped and current_speaker is None:
            continue

        # Try to match a speaker line
        m = SPEAKER_RE.match(stripped)
        if m:
            raw_name = m.group(1) or m.group(2) or m.group(3)
            content_start = m.group(4) or ''

            if is_likely_speaker(raw_name):
                # Save previous message
                if current_speaker is not None:
                    messages.append((current_speaker, current_display, '\n'.join(current_lines).strip()))

                speaker_key = normalize_speaker(raw_name)
                current_speaker = speaker_key
                current_display = raw_name.strip()
                current_lines = [content_start] if content_start else []
                continue

        # Continuation of current message
        if current_speaker is not None:
            current_lines.append(line)
        # If no speaker yet, treat as preamble (skip)

    # Don't forget the last message
    if current_speaker is not None:
        messages.append((current_speaker, current_display, '\n'.join(current_lines).strip()))

    return messages


# ============================================================
# HTML GENERATION
# ============================================================

def escape(text):
    """HTML-escape text while preserving intentional whitespace."""
    return html.escape(text)


def message_html(speaker_key, display_name, content, config):
    """Generate HTML for a single message."""
    info = SPEAKERS.get(speaker_key, DEFAULT_SPEAKER)
    cls = info['class']
    escaped_content = escape(content)

    return f'''      <div class="message {cls}">
        <div class="speaker {cls}">{escape(display_name)}:</div>
        <div class="content">{escaped_content}</div>
      </div>
'''


def page_marker_html(page_num):
    """Generate a page marker."""
    return f'      <div class="page-marker">&mdash; Page {page_num} &mdash;</div>\n'


def generate_page(messages, config):
    """Generate the complete HTML page."""
    title = config['title']
    date = config['date']
    participants = config['participants']
    source = config['source']
    url_path = config['url_path']
    msgs_per_page = config['messages_per_page']

    # Build message HTML with page markers
    body_parts = []
    page_num = 1
    body_parts.append(page_marker_html(page_num))

    for i, (speaker_key, display_name, content) in enumerate(messages):
        if i > 0 and i % msgs_per_page == 0:
            page_num += 1
            body_parts.append(page_marker_html(page_num))

        body_parts.append(message_html(speaker_key, display_name, content, config))

    messages_html = '\n'.join(body_parts)

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape(title)} | Aethryn Navigator</title>
  <link rel="stylesheet" href="/css/aethryn.css">
  <style>
    .message {{ margin: 15px 0; padding: 12px; border: 1px solid #ccc; border-radius: 3px; }}
    .message.mike {{ background: #e8f5e9; border-left: 4px solid #006400; }}
    .message.claude {{ background: #e3f2fd; border-left: 4px solid #000080; }}
    .message.grok {{ background: #f0e6d3; border-left: 4px solid #8B4513; }}
    .message.gpt {{ background: #fff8e0; border-left: 4px solid #ff9800; }}
    .message.ryn {{ background: #f3e5f5; border-left: 4px solid #800080; }}
    .message.system {{ background: #f5f5f5; border-left: 4px solid #808080; font-size: 11px; color: #666; }}
    .message.nano {{ background: #e8f5e9; border-left: 4px solid #2e7d32; }}
    .message.unknown {{ background: #f9f9f9; border-left: 4px solid #999; }}
    .message .speaker {{ font-weight: bold; margin-bottom: 8px; font-size: 13px; }}
    .message .speaker.mike {{ color: #006400; }}
    .message .speaker.claude {{ color: #000080; }}
    .message .speaker.grok {{ color: #8B4513; }}
    .message .speaker.gpt {{ color: #e65100; }}
    .message .speaker.ryn {{ color: #800080; }}
    .message .speaker.nano {{ color: #2e7d32; }}
    .message .speaker.unknown {{ color: #333; }}
    .message .content {{ line-height: 1.6; white-space: pre-wrap; }}
    .page-marker {{ text-align: center; padding: 10px; margin: 20px 0; background: #d4d0c8; border: 1px groove #808080; font-size: 11px; color: #666; }}
    .convo-content {{ flex: 1; max-height: 75vh; overflow-y: auto; padding: 10px; background: #fff; border: 2px inset #808080; }}
  </style>
</head>
<body>
<div class="window">

  <div class="title-bar">
    <span>{escape(title)} | Aethryn Navigator</span>
    <div class="title-bar-buttons"><div></div><div></div><div></div></div>
  </div>

  <div class="toolbar">
    <button onclick="history.back()">&#9664; Back</button>
    <button onclick="history.forward()">Forward &#9654;</button>
    <button onclick="location.reload()">&#8635; Reload</button>
    <button onclick="location.href='/'">&#8962; Home</button>
    <div class="logo-small">
      {LOGO_SVG}
    </div>
  </div>

  <div class="address-bar">
    <span>Location:</span>
    <input type="text" value="https://aethryn.com{escape(url_path)}" readonly>
    <button>Go</button>
  </div>

  <div class="linkbar">
    <button onclick="location.href='/'">Home</button>
    <button onclick="location.href='/boot.html'">Boot</button>
    <button onclick="location.href='/oath.html'">Oath</button>
    <button onclick="location.href='/VWP.html'">VWP</button>
    <button onclick="location.href='/claude/remembrance.html'">Remembrance</button>
    <button onclick="location.href='/validation/'">Validation</button>
    <button onclick="location.href='/relay_conversation.html'">Relay</button>
    <button onclick="location.href='/tools/spectrum/'">Spectrum</button>
  </div>

  <div class="main-content">
    <div class="convo-content">
      <h1>{escape(title)}</h1>

      <div class="meta">
        <strong>Date:</strong> {escape(date)}<br>
        <strong>Participants:</strong> {escape(participants)}<br>
        <strong>Source:</strong> {escape(source)}
      </div>

{messages_html}
    </div>
  </div>

  <div class="status-bar">
    <div>Document: Done</div>
    <div>Aethryn Navigator</div>
  </div>
</div>
</body>
</html>
'''


# ============================================================
# MAIN
# ============================================================

def main():
    source = CONFIG['source']
    output = CONFIG['output']

    if not os.path.exists(source):
        print(f"Error: Source file not found: {source}")
        sys.exit(1)

    with open(source, 'r', encoding='utf-8') as f:
        text = f.read()

    messages = parse_conversation(text)

    if not messages:
        print(f"Warning: No messages parsed from {source}")
        print("Check that the file uses one of the supported speaker formats:")
        print('  "Mike: text", "**Mike:** text", "MIKE: text", or "[MIKE]: text"')
        sys.exit(1)

    page_html = generate_page(messages, CONFIG)

    with open(output, 'w', encoding='utf-8') as f:
        f.write(page_html)

    # Summary
    speaker_counts = {}
    for speaker_key, display_name, content in messages:
        speaker_counts[display_name] = speaker_counts.get(display_name, 0) + 1

    pages = (len(messages) // CONFIG['messages_per_page']) + 1

    print(f"Generated: {output}")
    print(f"  Messages: {len(messages)}")
    print(f"  Pages: {pages}")
    print(f"  Speakers: {', '.join(f'{k} ({v})' for k, v in speaker_counts.items())}")


if __name__ == '__main__':
    main()
