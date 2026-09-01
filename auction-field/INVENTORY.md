# Auction-Field Research Package -- Data Inventory

Phase 1 inventory of the two existing spectrum data stores.
Prepared 2026-09-01 from tools/spectrum/data/ (v1) and
tools/spectrum-v3/data/ (v3).


## Spectrum v1 Store

Path: `tools/spectrum/data/`

### auctions.json

98 completed FCC spectrum auctions (1994--2022).

Fields per record (16):
  id, auction_number, auction_name, freq_band, freq_lower_hz,
  freq_upper_hz, start_date, end_date, total_revenue, total_licenses,
  total_bidders, winning_bidders, status, description, source_url,
  last_updated

Every row carries a source_url of the form
`https://www.fcc.gov/auction/{N}` (98 of 98 populated). Revenue spans
$60K (Auction 90, VHF TV) to $81.2B (Auction 107, C-Band). Dates
range 1994-07-25 to 2022-08-26.

Auction numbers present:
  1--12, 14--18, 21--28, 30, 32--46, 48--66, 68--73, 80--100,
  101--103, 105, 107--110, 1000--1002

Numbers 13, 19--20, 29, 31, 47, 67, 74--79, 104, 106 were never
assigned by the FCC or were cancelled.


### companies.json

59 companies/entities with editorial research notes.

Fields per record (18):
  id, name, legal_name, parent_company, parent_company_id,
  company_type, description, headquarters, website, sec_cik, fcc_frn,
  govt_contracts, defense_intel_connections, total_spectrum_value,
  subsidiaries, notes, source, last_updated

10 of 59 have FCC FRN values. Company types include carrier (15),
speculator (9), holding (10), defense (5), satellite (5), iot (4),
utility (2), and others. Narrative fields (defense_intel_connections,
govt_contracts, notes) contain editorial analysis, not raw FCC data.


### auction_results.json

87 winner-only bid rows covering 15 auctions.

Fields per record (11):
  id, auction_number, company_id, company_name, license_area,
  bid_amount, mhz_won, block, is_winner, license_id, source

Every row has is_winner=1. No losing bids. company_id is null on all
rows -- linkage to companies.json is by name only. The 15 auctions
covered are the major wireless auctions: 4, 5, 35, 66, 73, 96, 97,
101, 102, 103, 105, 107, 108, 110, 1000.

The remaining 83 auctions have no bid-level data in v1.


### allocations.json

2,480 frequency allocation records from the NTIA/FCC table.

Fields per record (14):
  id, freq_lower_hz, freq_upper_hz, freq_lower_display,
  freq_upper_display, service, allocation_type, user_type, region,
  footnotes, cfr_citation, description, source, last_updated


### ism_bands.json

8 ISM (Industrial, Scientific, Medical) band records with detailed
regulatory analysis.

Fields per record (15):
  id, freq_lower_hz, freq_upper_hz, freq_display, band_name,
  part_rules, power_limit, use_cases, adjacent_licensed,
  interference_issues, pending_rulemaking, regulatory_status, notes,
  source, last_updated

Covers: 6.78 MHz, 13.56 MHz, 27.12 MHz, 902--928 MHz, 2.4 GHz,
5 GHz UNII, 6 GHz WiFi 6E, 60 GHz V-band.


### govt_allocations.json

24 government/military spectrum allocation records.

Fields per record (12):
  id, freq_lower_hz, freq_upper_hz, freq_display, agency, use_type,
  classification, shared_with, description, source, last_updated

Classification levels: public, sensitive, classified-band. Agencies
include DoD, USSF, FAA, NOAA, NASA, NTIA. Covers GPS L1/L2/L5,
military UHF SATCOM, AEHF, X-band radar, CBRS sharing, OBBBA
pipeline bands.


### rulemaking.json

13 rulemaking/proceeding records.

Fields per record (12):
  id, docket_number, title, rulemaking_type, freq_lower_hz,
  freq_upper_hz, freq_display, status, summary, proposed_changes,
  filing_date, comment_deadline, source_url, last_updated

Types: Petition for Rulemaking, NPRM, NOI, R&O, Legislation.
Includes NextNav 900 MHz petition (RM-11953), OBBBA spectrum
pipeline, Upper C-Band NPRM, 6 GHz VLP expansion, Part 100
satellite overhaul.


### spectrum_bands.json

Composite file with two top-level keys:

- `bands`: 1,196 spectrum band allocation entries
  Fields: freq_lower_hz, freq_upper_hz, freq_lower_display,
  freq_upper_display, services, user_type, alloc_types,
  color_category

- `ism_bands`: 8 ISM band entries (same data as ism_bands.json)


## Spectrum v3 Store

Path: `tools/spectrum-v3/data/`

### entities.json

652 entities (companies, shell companies, government bodies).

Fields per record (15):
  id, name, legal_name, frn, entity_type, industry_description,
  state_incorporated, status, ultimate_parent_id,
  is_defense_contractor, is_intel_community, total_spectrum_spend,
  total_mhz_held, auction_count, win_count

376 of 652 have FRN values. Entity types: other (509),
corporation (111), llc (30), government (1), partnership (1).

13 duplicate legal_name values (each appearing twice):
  AT&T Inc., Cellco Partnership, United States Cellular Corporation,
  SpectrumCo LLC, Channel 51 License Co LLC, MetroPCS
  Communications Inc., Choice Phone LLC, Qualcomm Incorporated,
  Clearwire Corporation, Sprint Corporation, Comcast Corporation,
  Wetterhorn Wireless LLC, Anterix Inc.


### relationships.json

784 relationship edges between entities.

Fields per record (6):
  entity_id_from, entity_id_to, relationship_type,
  relationship_detail, from_name, to_name

No source_url field exists on any row. Relationship types:
  co-bidder        541
  parent-subsidiary 147
  affiliate          51
  acquisition        18
  spectrum-lease     12
  joint-venture       9
  merger              4
  dba                 2


### bids.json

824 bids covering 71 of 98 auctions.

Fields per record (13):
  auction_id, entity_id, bidder_name, license_area, mhz, bid_amount,
  is_winner, auction_number, auction_name, bands, entity_name,
  is_defense_contractor, entity_status

654 winning bids (is_winner=1), 170 losing bids (is_winner=0).

All 170 losing bids have bid_amount=0. No actual losing bid amounts
were ever scraped from FCC sources. The zeros are placeholders
recording that an entity participated and lost, not that their bid
was literally zero.

Example -- AT&T Spectrum Frontiers LLC (entity_id=4, FRN 0027840180):
  Auction 107  won  $23,406,860,839
  Auction 102  won  $982,000,000
  Auction 101  lost $0  (placeholder)
  Auction 105  lost $0  (placeholder)


### auctions.json

98 auctions -- same set as v1.

Fields per record (12):
  auction_number, name, description, bands, freq_bands, start_date,
  end_date, total_revenue, num_licenses, num_bidders, num_winners,
  status

source_url has been stripped from all 98 rows. v1 retains it. The
v3 schema also drops: id, freq_lower_hz, freq_upper_hz, last_updated.
Field renaming: total_bidders -> num_bidders, winning_bidders ->
num_winners, total_licenses -> num_licenses.


### allocations.json

1,166 frequency allocation records.

Fields per record (13):
  freq_low_hz, freq_high_hz, freq_low_display, freq_high_display,
  allocation_type, service_primary, service_secondary, itu_footnotes,
  regulatory_citation, description, band_class, is_auctioned, services


### proceedings.json

13 regulatory proceeding records (same content as v1 rulemaking.json,
restructured).

Fields per record (14):
  id, allocation_id, proceeding_type, docket_number, title,
  description, filing_date, status, url, created_at, freq_low_hz,
  freq_high_hz, freq_low_display, freq_high_display


### stats.json

Aggregate statistics (single object):
  totalAllocations:   1,166
  totalEntities:        652
  totalAuctions:         98
  totalRevenue:  $293,563,816,000
  defenseEntities:       99
  intelEntities:         31
  ghostEntities:         39
  totalBids:            824
  totalRelationships:   784
  moneyTraceable: $241,112,767,690


## Cross-Store Comparison

### Auction Coverage

Both stores list the same 98 auctions by number.

Auction numbers present in both:
  1--12, 14--18, 21--28, 30, 32--46, 48--66, 68--73, 80--100,
  101--103, 105, 107--110, 1000--1002

v1 auctions exclusive: none
v3 auctions exclusive: none

### Bid Coverage

v1 auction_results covers 15 auctions (87 rows, winners only).
v3 bids covers 71 auctions (824 rows, winners and losers).

27 auctions have no bid-level data in v3:
  68, 69, 70, 71, 72, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  90, 91, 92, 93, 94, 95, 96, 98, 99, 100, 109, 1001

These are predominantly FM/AM broadcast auctions, paging, LPTV,
and the 600 MHz reverse auction -- smaller or broadcast-only
proceedings where per-bidder data was not scraped.

### Entity Coverage

v1 companies: 59 curated entries with editorial narrative.
v3 entities: 652 entries with structured metadata.

v1 has richer qualitative fields (defense_intel_connections,
govt_contracts, subsidiaries as JSON strings). v3 has broader
coverage and structured flags (is_defense_contractor,
is_intel_community, ultimate_parent_id).


## Known Data Gaps

### 1. Zero-Amount Losses

170 bids in v3 have bid_amount=0 and is_winner=0. Public losing bid
amounts were never scraped from FCC auction results. These zeros
record participation, not actual dollar amounts.

### 2. source_url Stripped from v3 Auctions

All 98 v3 auction rows lack source_url. The v1 store retains the
canonical `https://www.fcc.gov/auction/{N}` links on every row.

### 3. Relationship Edges Unsourced

All 784 relationship edges in v3 have no source_url or citation
field. The relationship_detail field contains free text but no
provenance chain to FCC filings, SEC records, or press reports.

### 4. 27 Auctions Without Bid Data

Neither store has per-bidder results for 27 of 98 auctions. Most
are broadcast-only or minor service auctions (FM, AM, paging, LPTV).
H Block (Auction 96) is a notable exception -- a $1.564B auction
with documented results (Dish won all 176 licenses) but no bid
rows in v3.

### 5. Duplicate Legal Names

13 legal_name values appear twice in v3 entities.json. These may
represent the same company bidding under the same legal name in
different auctions, or true duplicates that need deduplication.

### 6. Entity Linkage

v1 auction_results.company_id is null on all 87 rows. v3 bids use
entity_id, which does link to entities.json. Cross-store matching
between v1 company names and v3 entity names is string-based only.

### 7. FRN Coverage

v1: 10 of 59 companies have FCC FRN values (17%).
v3: 376 of 652 entities have FRN values (58%).
276 v3 entities lack the FRN needed for authoritative FCC lookups.

### 8. Allocation Table Divergence

v1 has 2,480 allocation records; v3 has 1,166. Different schemas,
different granularity. v1 includes region and footnotes fields; v3
adds band_class and is_auctioned flags. Neither is a superset.
