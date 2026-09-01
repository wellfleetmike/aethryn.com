# sources/

This directory is reserved for raw FCC download files (public notices,
bid CSVs, qualified bidder lists). It is currently empty because all
FCC domains (www.fcc.gov, auctiondata.fcc.gov, docs.fcc.gov) were
blocked by the build environment's egress proxy during the initial
package build on 2026-09-01.

When FCC access is available, download raw files here and re-derive
the JSON files from them. See RUNBOOK.md for the rebuild procedure.

Expected contents per auction:
- {auction_number}_public_notice.pdf
- {auction_number}_qualified_bidders.csv
- {auction_number}_results.csv
- {auction_number}_bids.csv (where public)
