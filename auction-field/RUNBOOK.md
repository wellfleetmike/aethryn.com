# RUNBOOK -- auction-field research package

Built: 2026-09-01
Author: Claude (at Mike's direction)
Repo: wellfleetmike/aethryn.com
Branch: claude/spectrum-auction-field-research-xqk0im

## Purpose

Local research package capturing public FCC auction-field records that the
existing v1 (tools/spectrum/data/) and v3 (tools/spectrum-v3/data/) stores
lack or store incorrectly. This package does NOT replace v3 on the site.
It sits alongside it as a reference layer for verification and gap-filling.

## Constraints

1. No direct FCC access -- www.fcc.gov, auctiondata.fcc.gov, docs.fcc.gov
   all blocked by the build environment's egress proxy. Package derives
   from existing v1/v3 stores plus search engine snippet data.
2. No modifications to tools/spectrum/ or tools/spectrum-v3/.
3. No new v3 entity IDs created -- identity_map references only.
4. bid_amount is null when not public; 0 only if the FCC file itself
   prints zero. The 170 v3 losing bids stored as 0 are corrected to null.
5. Duplicate FRNs flagged, not merged.

## File manifest and build procedure

### INVENTORY.md
**What:** Documents contents and gaps of v1 and v3 data stores.
**How built:** Direct read of all v1 files (auctions.json, companies.json,
auction_results.json) and v3 files (auctions.json, entities.json, bids.json,
relationships.json, stats.json). Python extraction for oversized files
(entities.json at 83K tokens, bids.json at 91K tokens).
**Re-run:** Read all source files, compare field schemas, count rows,
identify missing fields and cross-reference gaps.

### auctions.json
**What:** 98 auction catalog entries merging v1 and v3 fields.
**How built:** Outer-joined v1 auctions.json (98 rows, has source_url,
freq ranges, total_bidders, winning_bidders) with v3 auctions.json (98
rows, has description, status, auction_name variants). Reconstructed
page_url from pattern https://www.fcc.gov/auction/{N}. Added
field_data_status tracking.
**Re-run:** Read both source auctions.json files, merge on auction_number,
apply page_url pattern.

### identity_map.json
**What:** 652 entries mapping every v3 entity to FRN, v1 company, and
match provenance.
**How built:** Read all 652 v3 entities. For each:
  1. If entity has FRN, search v1 companies.json for matching fcc_frn.
  2. If no FRN match, try exact legal_name match against v1 legal_name.
  3. If no exact match, try normalized alias match (lowercase, strip
     suffixes like LLC/Inc/Corp, strip d/b/a).
  4. If no match at all, mark match_rule=null, unmatched where no FRN.
  5. Flag duplicate_frn=true when multiple v3 entities share an FRN.
**Match rule counts:** frn=359, exact_legal_name=50, alias=29, null=214.
**Duplicate FRN pairs:** 8 pairs (16 entries) flagged.
**Re-run:** Read v3 entities.json and v1 companies.json, apply match
cascade, flag duplicates.

### qualified_bidders.json
**What:** Per-auction qualified bidder list derived from v3 bid data.
**How built:** Every entity that placed a bid in v3 bids.json is by
definition a qualified bidder for that auction. Extracted unique
(auction_number, entity_id, is_winner) tuples from 824 v3 bid rows.
Cross-referenced identity_map for legal_name and FRN.
**Coverage:** 71 of 98 auctions (those with v3 bid entries). The
remaining 27 auctions have no bidder-level data in either store.
**Re-run:** Extract unique bidders from v3 bids.json, join identity_map.

### license_results.json
**What:** Per-license winner data from v1 auction_results.
**How built:** Direct copy of 87 v1 auction_results rows (all
is_winner=1) with v3_entity_id cross-reference added via identity_map
name/FRN matching. Covers 15 auctions.
**Re-run:** Read v1 auction_results.json, match winners to identity_map.

### bids.json
**What:** 824 bid rows from v3 with corrected amounts.
**How built:** Copied all v3 bid rows. For the 170 rows where
is_winner=0 AND bid_amount=0: set bid_amount=null, amount_public=false,
notes="v3 stores 0; actual amount not public". All other rows keep
original amounts with amount_public=true.
**Validation rule:** No row may have is_winner=0 AND bid_amount=0.
**Re-run:** Read v3 bids.json, apply correction rule, join identity_map
for legal_name/FRN.

### gaps.json
**What:** Structured record of every known data gap.
**How built:** Enumerated from build experience -- blocked URLs,
data quality issues found during extraction, coverage gaps computed
by comparing auction sets.
**Gap categories:** source_blocked, data_quality, coverage, methodology.
**Re-run:** Review all source access attempts and data quality findings.

### MANIFEST.txt
**What:** SHA256 hash of every file in auction-field/.
**How built:** sha256sum on each file after all other files are written.
**Re-run:** sha256sum auction-field/*

## AT&T Spectrum Frontiers LLC four-auction path

Required verification path per task spec:

Entity: AT&T Spectrum Frontiers LLC
v3_entity_id: 4
FRN: 0027840180
ultimate_parent_id: 376 (AT&T Auction Holdings LLC)

| Auction | Role   | bid_amount      | amount_public | Notes                          |
|---------|--------|-----------------|---------------|--------------------------------|
| 107     | Winner | $23,413,500,000 | true          | 600 MHz, 1621 licenses         |
| 102     | Winner | $982,500,000    | true          | 24 GHz, 831 licenses           |
| 101     | Loser  | null            | false          | 28 GHz, bid amount not public  |
| 105     | Loser  | null            | false          | 37/39 GHz, amount not public   |

This entity shares FRN 0027840180 with AT&T Inc. (v3_entity_id varies).
Both entries are flagged duplicate_frn=true in identity_map.json.
The identity_map does NOT merge them -- they remain separate entries
with the same FRN, as specified.

## Known limitations

1. **No raw FCC source downloads.** The entire package derives from
   existing v1/v3 data and search engine snippets. A proper field
   package would parse raw FCC CSV/TSV files from auctiondata.fcc.gov.
2. **Qualified bidder lists are incomplete.** Only entities that placed
   bids appear; entities that qualified but did not bid (withdrew,
   defaulted) are not captured.
3. **License-grain data covers only 15 auctions.** The other 83 auctions
   have only aggregate winner counts from v1/v3 auctions.json.
4. **Losing bid amounts are mostly not public.** 170 of 824 bids have
   null amounts. This is correct per FCC rules -- losing bid amounts
   for many auctions are not disclosed.
5. **Search snippet data not formally cited.** Winner data gathered
   from search engine result snippets during the build (auctions 97,
   101, 102, 103, 105, 107, 1002) is referenced in this runbook but
   not stored as raw source files since the snippets are transient.

## Re-running the full package

```bash
# From repo root, with FCC access available:
# 1. Download raw FCC auction data
#    curl https://auctiondata.fcc.gov/public/projects/auction{N}/reports/...
# 2. Parse qualified bidders from public notice PDFs
# 3. Parse license results from FCC results CSVs
# 4. Rebuild all JSON files
# 5. Recompute MANIFEST.txt
sha256sum auction-field/*.json auction-field/*.md > auction-field/MANIFEST.txt
```

Without FCC access, re-run the Python extraction scripts documented
in each file's build procedure above, using the v1 and v3 source
files as inputs.
