# CLAUDE.md -- aethryn.com

Rewritten 2026-08-09 by the Steward at Mike's direction; owned by the
Game Builder node (~/Desktop/relay/game_builder). The previous five-line
version said nothing anyone needed. Strict ASCII; rescan with
contamination_scanner.py after edits.

## What this repo is

Mike's site, served by GitHub Pages at aethryn.com. Static only: no
build step, no backend, no CDN dependencies. CNAME and .nojekyll are
load-bearing -- do not touch them.

    /            the standing site (index.html, boot.html, oath.html,
                 conversation pages, claude/ grok/ css/ js/)
    /loom/       the D&D character picker. ONE self-contained file.

## Design is part of building

Whoever edits a surface here is both designer and developer -- a cohesive
front end linked to the working back end, never decoration bolted on.
The designer seat is defined at
~/Desktop/relay/game_builder/.claude/agents/designer.md (adapted from
Mike's research copy of oh-my-claudecode). Its short form:

- Commit to the aesthetic direction before coding. /loom/ is an
  instrument panel: dark chassis, cream plates, amber signals. Extend
  it, never dilute it to defaults.
- No webfonts, no external anything -- files work with the network off.
- Every visible edge clears 3:1 on its surface. 390px first.
- The table is dyslexic: nothing that has to be read twice, read-aloud
  on every element, and it must never look like it is for kids.
  The loom-table skill is the authority when anything conflicts.

## Shipping gates, in order, no exceptions

1. tools/check_picker.js full harness GREEN (PICKER_URL for served tests)
2. ascii: zero bytes above 127
3. contamination_scanner.py clean
4. SHA256SUMS in game_builder/ updated
5. Commit locally with a clear message. A repaired run says repaired.
6. PUSH ONLY on Mike's word, through Steward review. After push, re-run
   the harness against the live URL and confirm the live sha matches.

Commits use the noreply author address -- the account blocks bare-email
pushes, correctly.

## Provenance

Content decides, the filename never does. Rules numbers on any page trace
to loom/rules/ (PDF sha cf18e1f8..., JSON pinned d3e333bb) -- never to a
model's recollection. Two independent sources for anything in front of
the kids.
