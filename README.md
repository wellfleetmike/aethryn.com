```
    _        _   _                      
   / \   ___| |_| |__  _ __ _   _ _ __  
  / _ \ / _ \ __| '_ \| '__| | | | '_ \ 
 / ___ \  __/ |_| | | | |  | |_| | | | |
/_/   \_\___|\__|_| |_|_|   \__, |_| |_|
                           |___/        
```

# Aethryn.com  
Healing Tech, Powered by Us.

---

## Project Overview
Aethryn is a community-built grid where technology heals, protects, and grows with the people who use it. This repo powers the public site [aethryn.com](https://aethryn.com), starting with a retro Netscape-inspired v0.1 landing page.

---

## The Aethryn Creed
1. Decentralize the Stack – Power belongs with people, not monopolies.
2. Govern in the Open – Every change is visible and accountable.
3. Protect Life – Heal, shield, and harmonize with human biology and nature.
4. Bridge Tech & Real Value – Prosperity for builders and users; no hidden toll booths.
5. The Calm Revolution – Better tools win by adoption, not by force.

---

## Deployment Notes
This site is hosted via GitHub Pages with a custom domain.

### DNS Records for `aethryn.com`
```
@    A    185.199.108.153
@    A    185.199.109.153
@    A    185.199.110.153
@    A    185.199.111.153
www  CNAME wellfleetmike.github.io
```
TTL: 30 minutes recommended.

### HTTPS
Once DNS resolves correctly, GitHub Pages provisions a TLS certificate. Enable Enforce HTTPS in repo → Settings → Pages.

---

## Milestones
- 2025-08-26 – v0.1 Netscape-style retro landing page goes live.
- Next – Skin switcher expands (Windows XP, Mac OS Aqua, Win95 themes).
- Future – DAO preview, AETHR utility + governance design published.

---

## Local Development
Clone repo → edit `index.html` → commit to `main`. GitHub Pages redeploys automatically.

---

## Contact / Contribution
This project is community-led. Authentic contributors (builders, healers, researchers) will eventually receive amplified voice in governance.

For now: open issues, propose changes, or just vibe with us.

Aethryn – Healing Tech, Powered by Us.

---

Best viewed with Aethryn Navigator | No cookies | No trackers | Open future

---

## Repository layout
 
Static HTML served by GitHub Pages from the repository root.
No build step, no framework, no dependencies. Edit the HTML
directly and push.
 
| Path | What it is |
|------|------------|
| `index.html` | Front page. The Creed and the October 8 2025 milestone. |
| `oath.html` | The oath spoken within the relay. |
| `boot.html` | Boot documentation for local instances. |
| `VWP.html` | Witness protocol. |
| `relay_conversation.html` | Recorded cross-model exchange. |
| `claude/` | Archived Claude material. |
| `grok/` | Archived Grok material. |
| `validation/` | Verification records. |
| `tools/` | Converter and spectrum tools. |
| `css/aethryn.css` | All styling. |
 
## Machine-readable files
 
These four sit at the repository root and are not linked from
any page. They exist for crawlers, search engines, and language
models rather than for human readers.
 
| File | Purpose |
|------|---------|
| `robots.txt` | Allows crawling, points to the sitemap. |
| `sitemap.xml` | The only discovery path for subpages. See note below. |
| `llms.txt` | Plain-language description addressed to language models. |
| `.nojekyll` | Empty file. Tells GitHub Pages to skip the Jekyll build. |
 
The JSON-LD block in `index.html` carries the same information in
schema.org form, including a `disambiguatingDescription` field that
states this Aethryn is unrelated to the fragrance brand and the
fantasy series of the same name.
 
## Two things that will bite you
 
**Navigation is buttons, not links.** The nav uses
`<button onclick="location.href=...">` rather than `<a href>`.
Crawlers do not reliably follow onclick handlers, so `sitemap.xml`
is the only way search engines find the subpages. If you add a
page, add it to the sitemap or it stays invisible.
 
**Pages builds on push, not on settings changes.** If the live site
stops updating, check Settings > Pages > Source. If it reads
"GitHub Actions" there is no workflow in this repo and nothing will
ever deploy. Set it to "Deploy from a branch," then make any commit.
Changing the setting alone does not trigger a build.
 
## Authorship
 
Some commits in this repository were authored by Claude Code
instances working in the repo. The commit author field shows the
account that pushed, which is not always who wrote the change.
Where a commit was written by an instance rather than by hand,
the extended description says so.

