// ============================================
// US RADIO FREQUENCY SPECTRUM RESEARCH TOOL
// Static D3.js Visualization — JSON data files
// Adapted for Aethryn Navigator static hosting
// ============================================

const DATA_BASE = '/tools/spectrum/data';
let spectrumData = { bands: [], ism_bands: [] };
let allAllocations = [];
let allAuctions = [];
let allAuctionResults = [];
let allCompanies = [];
let allIsmBands = [];
let allGovtAllocations = [];
let allRulemaking = [];
let currentBand = null;
let activeFilter = 'all';

// Notes in localStorage
function getLocalNotes() {
    try { return JSON.parse(localStorage.getItem('spectrum_notes') || '[]'); }
    catch { return []; }
}
function saveLocalNotes(notes) {
    localStorage.setItem('spectrum_notes', JSON.stringify(notes));
}

// ============================================
// HELPERS
// ============================================

function hzToDisplay(hz) {
    if (hz >= 1e9) return (hz / 1e9).toPrecision(4) + ' GHz';
    if (hz >= 1e6) return (hz / 1e6).toPrecision(4) + ' MHz';
    if (hz >= 1e3) return (hz / 1e3).toPrecision(4) + ' kHz';
    return hz + ' Hz';
}

function formatMoney(n) {
    if (!n) return '$0';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bandColor(category, alpha = 0.55) {
    const colors = {
        government: `rgba(248, 81, 73, ${alpha})`,
        commercial: `rgba(88, 166, 255, ${alpha})`,
        shared: `rgba(188, 140, 255, ${alpha})`,
        ism: `rgba(63, 185, 80, ${alpha})`,
        other: `rgba(48, 54, 61, ${alpha})`
    };
    return colors[category] || colors.other;
}

function bandColorSolid(category) {
    const colors = {
        government: '#f85149',
        commercial: '#58a6ff',
        shared: '#bc8cff',
        ism: '#3fb950',
        other: '#484f58'
    };
    return colors[category] || colors.other;
}

// ============================================
// SPECTRUM MAP VISUALIZATION
// ============================================

const svg = d3.select('#spectrum-svg');
const container = document.getElementById('spectrum-container');
const tooltip = document.getElementById('band-tooltip');
const freqIndicator = document.getElementById('freq-indicator');

let width, height;
let xScale, yBandHeight;
let zoom;

function initSpectrum() {
    width = container.clientWidth;
    height = container.clientHeight;

    xScale = d3.scaleLog()
        .domain([3e3, 300e9])
        .range([0, width])
        .clamp(true);

    yBandHeight = Math.min(height * 0.6, 200);

    zoom = d3.zoom()
        .scaleExtent([1, 10000])
        .translateExtent([[0, 0], [width, height]])
        .on('zoom', onZoom);

    svg.attr('width', width).attr('height', height);
    svg.call(zoom);

    renderSpectrum();

    svg.on('mousemove', function(event) {
        const [mx] = d3.pointer(event);
        const currentTransform = d3.zoomTransform(svg.node());
        const newScale = currentTransform.rescaleX(xScale);
        const freq = newScale.invert(mx);
        freqIndicator.textContent = hzToDisplay(freq);
    });
}

function onZoom(event) {
    renderSpectrum(event.transform);
}

function renderSpectrum(transform = d3.zoomIdentity) {
    const newScale = transform.rescaleX(xScale);

    svg.selectAll('*').remove();

    const g = svg.append('g');
    const bandY = height * 0.15;

    // Frequency axis
    const axisG = g.append('g')
        .attr('transform', `translate(0, ${bandY + yBandHeight + 5})`);

    const [domainMin, domainMax] = newScale.domain();
    const ticks = generateFreqTicks(domainMin, domainMax);

    ticks.forEach(freq => {
        const x = newScale(freq);
        if (x >= 0 && x <= width) {
            axisG.append('line')
                .attr('x1', x).attr('x2', x)
                .attr('y1', 0).attr('y2', 6)
                .attr('stroke', '#484f58');

            axisG.append('text')
                .attr('x', x).attr('y', 18)
                .attr('text-anchor', 'middle')
                .attr('fill', '#8b949e')
                .attr('font-size', '10px')
                .text(hzToDisplay(freq));
        }
    });

    // Band designation labels
    const bandDesignations = [
        { name: 'VLF', min: 3e3, max: 30e3 },
        { name: 'LF', min: 30e3, max: 300e3 },
        { name: 'MF', min: 300e3, max: 3e6 },
        { name: 'HF', min: 3e6, max: 30e6 },
        { name: 'VHF', min: 30e6, max: 300e6 },
        { name: 'UHF', min: 300e6, max: 3e9 },
        { name: 'SHF', min: 3e9, max: 30e9 },
        { name: 'EHF', min: 30e9, max: 300e9 }
    ];

    bandDesignations.forEach(bd => {
        const x1 = newScale(bd.min);
        const x2 = newScale(bd.max);
        if (x2 > 0 && x1 < width) {
            const cx = (Math.max(x1, 0) + Math.min(x2, width)) / 2;
            g.append('text')
                .attr('x', cx)
                .attr('y', bandY - 8)
                .attr('text-anchor', 'middle')
                .attr('fill', '#484f58')
                .attr('font-size', '11px')
                .attr('font-weight', '600')
                .text(bd.name);

            if (x1 > 0) {
                g.append('line')
                    .attr('x1', x1).attr('x2', x1)
                    .attr('y1', bandY - 16).attr('y2', bandY + yBandHeight)
                    .attr('stroke', '#21262d')
                    .attr('stroke-dasharray', '2,2');
            }
        }
    });

    // Filter bands
    let bands = spectrumData.bands;
    if (activeFilter === 'ism') {
        // Show only bands that overlap with known ISM/unlicensed frequency ranges
        const ismRanges = allIsmBands.length > 0 ? allIsmBands : [
            { freq_lower_hz: 6765e3, freq_upper_hz: 6795e3 },
            { freq_lower_hz: 13553e3, freq_upper_hz: 13567e3 },
            { freq_lower_hz: 26957e3, freq_upper_hz: 27283e3 },
            { freq_lower_hz: 902e6, freq_upper_hz: 928e6 },
            { freq_lower_hz: 2400e6, freq_upper_hz: 2483.5e6 },
            { freq_lower_hz: 5150e6, freq_upper_hz: 5825e6 },
            { freq_lower_hz: 5925e6, freq_upper_hz: 7125e6 },
            { freq_lower_hz: 57e9, freq_upper_hz: 71e9 }
        ];
        bands = bands.filter(b => ismRanges.some(ism =>
            b.freq_lower_hz < ism.freq_upper_hz && b.freq_upper_hz > ism.freq_lower_hz
        ));
    } else if (activeFilter !== 'all') {
        bands = bands.filter(b => b.color_category === activeFilter);
    }

    // Draw allocation bands
    bands.forEach(band => {
        const x1 = newScale(band.freq_lower_hz);
        const x2 = newScale(band.freq_upper_hz);

        if (x2 < 0 || x1 > width) return;
        const bandWidth = Math.max(x2 - x1, 1);

        const rect = g.append('rect')
            .attr('x', Math.max(x1, 0))
            .attr('y', bandY)
            .attr('width', Math.min(bandWidth, width - Math.max(x1, 0)))
            .attr('height', yBandHeight)
            .attr('fill', bandColor(band.color_category))
            .attr('stroke', bandColorSolid(band.color_category))
            .attr('stroke-width', bandWidth > 3 ? 0.5 : 0)
            .attr('cursor', 'pointer');

        rect.on('mouseenter', function(event) {
            d3.select(this).attr('fill', bandColor(band.color_category, 0.85));
            showTooltip(event, band);
        });

        rect.on('mouseleave', function() {
            d3.select(this).attr('fill', bandColor(band.color_category));
            hideTooltip();
        });

        rect.on('click', function() {
            selectBand(band);
        });

        if (bandWidth > 50) {
            g.append('text')
                .attr('x', Math.max(x1, 0) + bandWidth / 2)
                .attr('y', bandY + yBandHeight / 2)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('fill', '#e6edf3')
                .attr('font-size', Math.min(11, bandWidth / 8) + 'px')
                .attr('pointer-events', 'none')
                .text((band.services || '').split(',')[0]?.trim().substring(0, 20));
        }
    });

    // ISM band overlays
    spectrumData.ism_bands.forEach(ism => {
        const x1 = newScale(ism.freq_lower_hz);
        const x2 = newScale(ism.freq_upper_hz);
        if (x2 < 0 || x1 > width) return;

        const bandWidth = Math.max(x2 - x1, 2);
        g.append('rect')
            .attr('x', Math.max(x1, 0))
            .attr('y', bandY - 4)
            .attr('width', Math.min(bandWidth, width - Math.max(x1, 0)))
            .attr('height', yBandHeight + 8)
            .attr('fill', 'none')
            .attr('stroke', '#3fb950')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2')
            .attr('pointer-events', 'none');

        if (bandWidth > 30) {
            g.append('text')
                .attr('x', Math.max(x1, 0) + bandWidth / 2)
                .attr('y', bandY + yBandHeight + 30)
                .attr('text-anchor', 'middle')
                .attr('fill', '#3fb950')
                .attr('font-size', '10px')
                .attr('pointer-events', 'none')
                .text(ism.band_name || ism.freq_display || '');
        }
    });
}

function generateFreqTicks(min, max) {
    const ticks = [];
    const decades = [
        1e3, 3e3, 10e3, 30e3, 100e3, 300e3,
        1e6, 3e6, 10e6, 30e6, 100e6, 300e6,
        1e9, 3e9, 10e9, 30e9, 100e9, 300e9
    ];

    decades.forEach(d => {
        if (d >= min * 0.5 && d <= max * 2) {
            ticks.push(d);
            if (max / min < 100) {
                [1.5, 2, 5, 7].forEach(m => {
                    const t = d * m;
                    if (t >= min && t <= max && t < d * 10) ticks.push(t);
                });
            }
        }
    });

    const landmarks = [
        535e3, 1705e3, 88e6, 108e6, 470e6, 698e6,
        700e6, 850e6, 902e6, 928e6, 1710e6, 2200e6,
        2400e6, 2483.5e6, 3550e6, 3700e6, 5150e6, 5825e6,
        24e9, 28e9, 39e9
    ];

    landmarks.forEach(f => {
        if (f >= min && f <= max) ticks.push(f);
    });

    return [...new Set(ticks)].sort((a, b) => a - b);
}

// ============================================
// TOOLTIP
// ============================================

function showTooltip(event, band) {
    const services = (band.services || 'Unknown').split(',').map(s => s.trim()).join(', ');
    const userType = band.user_type || 'Unknown';

    tooltip.innerHTML = `
        <div class="freq-range">${escapeHtml(band.freq_lower_display) || hzToDisplay(band.freq_lower_hz)} &mdash; ${escapeHtml(band.freq_upper_display) || hzToDisplay(band.freq_upper_hz)}</div>
        <div class="service-name">${escapeHtml(services)}</div>
        <div class="user-type">${escapeHtml(userType)} | ${escapeHtml(band.alloc_types || '')}</div>
    `;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(event.offsetX + 12, width - 300) + 'px';
    tooltip.style.top = (event.offsetY + 12) + 'px';
}

function hideTooltip() {
    tooltip.style.display = 'none';
}

// ============================================
// DRILL DOWN — DETAIL PANEL (all client-side)
// ============================================

function selectBand(band) {
    currentBand = band;
    const fMin = band.freq_lower_hz;
    const fMax = band.freq_upper_hz;
    const freqRange = `${band.freq_lower_display || hzToDisplay(fMin)} &mdash; ${band.freq_upper_display || hzToDisplay(fMax)}`;

    document.getElementById('detail-welcome').style.display = 'none';
    const content = document.getElementById('detail-content');
    content.style.display = 'block';

    // Scroll detail panel into view
    setTimeout(() => {
        document.getElementById('detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    // Filter data client-side
    const allocations = allAllocations.filter(a => a.freq_upper_hz >= fMin && a.freq_lower_hz <= fMax);
    const auctions = allAuctions.filter(a => a.freq_upper_hz >= fMin && a.freq_lower_hz <= fMax);
    const ismBands = allIsmBands.filter(b => b.freq_lower_hz < fMax && b.freq_upper_hz > fMin);
    const govtAllocs = allGovtAllocations.filter(b => b.freq_lower_hz < fMax && b.freq_upper_hz > fMin);
    const rulemakingData = allRulemaking.filter(r => r.freq_upper_hz >= fMin && r.freq_lower_hz <= fMax);

    let html = `<h2>${freqRange}</h2>`;

    // Tabs
    html += `<div class="detail-tabs">
        <div class="detail-tab active" data-tab="allocation">Allocation</div>
        <div class="detail-tab" data-tab="auctions">Auctions</div>
        <div class="detail-tab" data-tab="holders">Holders</div>
        <div class="detail-tab" data-tab="regulatory">Regulatory</div>
        <div class="detail-tab" data-tab="notes">Notes</div>
    </div>`;

    // TAB: ALLOCATION
    html += `<div class="tab-content" data-tab="allocation">`;
    if (allocations.length > 0) {
        allocations.forEach(a => {
            html += `<div class="detail-section">
                <div class="detail-row"><span class="label">Service</span><span class="value">${escapeHtml(a.service || 'Unknown')}</span></div>
                <div class="detail-row"><span class="label">Type</span><span class="value">${escapeHtml(a.allocation_type || '')}</span></div>
                <div class="detail-row"><span class="label">User</span><span class="value">${escapeHtml(a.user_type || '')}</span></div>
                ${a.footnotes ? `<div class="detail-row"><span class="label">Footnotes</span><span class="value">${escapeHtml(a.footnotes)}</span></div>` : ''}
                ${a.cfr_citation ? `<div class="detail-row"><span class="label">CFR</span><span class="value">${escapeHtml(a.cfr_citation)}</span></div>` : ''}
                ${a.description ? `<div class="detail-row"><span class="label">Description</span><span class="value">${escapeHtml(a.description)}</span></div>` : ''}
            </div>`;
        });
    } else {
        html += '<p class="loading">No allocation data for this band.</p>';
    }

    // ISM overlay
    if (ismBands.length > 0) {
        ismBands.forEach(ism => {
            html += `<div class="ism-highlight">
                <h3>${escapeHtml(ism.band_name || ism.freq_display || 'ISM Band')}</h3>
                ${ism.part_rules ? `<div class="detail-row"><span class="label">Rules</span><span class="value">${escapeHtml(ism.part_rules)}</span></div>` : ''}
                ${ism.power_limit ? `<div class="detail-row"><span class="label">Power Limit</span><span class="value">${escapeHtml(ism.power_limit)}</span></div>` : ''}
                ${ism.use_cases ? `<div class="detail-row"><span class="label">Use Cases</span><span class="value">${escapeHtml(ism.use_cases)}</span></div>` : ''}
                ${ism.regulatory_status ? `<div class="detail-row"><span class="label">Status</span><span class="value">${escapeHtml(ism.regulatory_status)}</span></div>` : ''}
                ${ism.pending_rulemaking ? `<div class="detail-row"><span class="label">Pending</span><span class="value">${escapeHtml(ism.pending_rulemaking)}</span></div>` : ''}
                ${ism.notes ? `<p style="font-size:11px;color:var(--spec-text-secondary);margin-top:6px">${escapeHtml(ism.notes)}</p>` : ''}
            </div>`;
        });
    }

    // Government allocations
    if (govtAllocs.length > 0) {
        html += '<h3>Government/Military</h3>';
        govtAllocs.forEach(ga => {
            html += `<div class="detail-section">
                <div class="detail-row"><span class="label">Agency</span><span class="value">${escapeHtml(ga.agency || '')}</span></div>
                <div class="detail-row"><span class="label">Use</span><span class="value">${escapeHtml(ga.use_type || '')}</span></div>
                ${ga.description ? `<div class="detail-row"><span class="label">Detail</span><span class="value">${escapeHtml(ga.description)}</span></div>` : ''}
            </div>`;
        });
    }
    html += `</div>`;

    // TAB: AUCTIONS
    html += `<div class="tab-content" data-tab="auctions" style="display:none">`;
    if (auctions.length > 0) {
        auctions.forEach(a => {
            html += `<div class="auction-item" data-auction="${a.auction_number}">
                <div class="auction-name">Auction ${a.auction_number}: ${escapeHtml(a.auction_name || a.freq_band || '')}</div>
                <div class="auction-meta">
                    <span>${escapeHtml(a.start_date || '')}</span>
                    <span style="color:var(--spec-accent-green);font-family:monospace">${formatMoney(a.total_revenue)}</span>
                    <span>${a.total_bidders || '?'} bidders</span>
                </div>
            </div>`;
        });
    } else {
        html += '<p class="loading">No auction data for this band.</p>';
    }
    html += '</div>';

    // TAB: HOLDERS
    html += `<div class="tab-content" data-tab="holders" style="display:none">`;
    html += '<div id="holders-list"><p class="loading">Select an auction to see license holders.</p></div>';
    html += '</div>';

    // TAB: REGULATORY
    html += `<div class="tab-content" data-tab="regulatory" style="display:none">`;
    if (rulemakingData.length > 0) {
        rulemakingData.forEach(r => {
            html += `<div class="rulemaking-item">
                <div class="title">${escapeHtml(r.title || 'Untitled')}</div>
                <div class="docket">${escapeHtml(r.docket_number || '')} | ${escapeHtml(r.rulemaking_type || '')}</div>
                <div class="status">Status: ${escapeHtml(r.status || 'Unknown')} | Filed: ${escapeHtml(r.filing_date || 'N/A')}</div>
                ${r.summary ? `<p style="font-size:11px;margin-top:4px;color:var(--spec-text-secondary)">${escapeHtml(r.summary)}</p>` : ''}
            </div>`;
        });
    } else {
        html += '<p class="loading">No active rulemaking for this band.</p>';
    }
    html += '</div>';

    // TAB: NOTES
    html += `<div class="tab-content" data-tab="notes" style="display:none">
        <div id="notes-section">
            <textarea id="note-input" placeholder="Add a note about this band..."></textarea>
            <button class="note-save-btn" id="note-save-btn">Save Note</button>
            <div id="notes-list" style="margin-top:10px"></div>
        </div>
    </div>`;

    content.innerHTML = html;

    // Wire up tabs
    content.querySelectorAll('.detail-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            content.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            content.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
            content.querySelector(`.tab-content[data-tab="${this.dataset.tab}"]`).style.display = 'block';
            if (this.dataset.tab === 'notes') loadNotes(fMin, fMax);
        });
    });

    // Wire up auction click -> holders
    content.querySelectorAll('.auction-item[data-auction]').forEach(item => {
        item.addEventListener('click', function() {
            loadAuctionDetail(parseInt(this.dataset.auction));
        });
    });

    // Wire up note save
    const saveBtn = document.getElementById('note-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() { saveNote(fMin, fMax); });
    }
}

function loadAuctionDetail(auctionNum) {
    const auction = allAuctions.find(a => a.auction_number === auctionNum);
    const results = allAuctionResults.filter(r => r.auction_number === auctionNum)
        .sort((a, b) => (b.bid_amount || 0) - (a.bid_amount || 0));

    const holdersDiv = document.getElementById('holders-list');

    if (!auction) {
        holdersDiv.innerHTML = '<p class="loading">Auction data not found.</p>';
        return;
    }

    let html = `<h3>Auction ${auctionNum}: ${escapeHtml(auction.auction_name || '')}</h3>`;
    html += `<div class="detail-section">
        <div class="detail-row"><span class="label">Revenue</span><span class="value money">${formatMoney(auction.total_revenue)}</span></div>
        <div class="detail-row"><span class="label">Dates</span><span class="value">${escapeHtml(auction.start_date || '')} &mdash; ${escapeHtml(auction.end_date || '')}</span></div>
        <div class="detail-row"><span class="label">Bidders</span><span class="value">${auction.total_bidders || '?'}</span></div>
    </div>`;

    if (results.length > 0) {
        html += '<h3>Top Bidders</h3>';
        results.slice(0, 20).forEach(r => {
            html += `<div class="company-card" data-company-name="${escapeHtml(r.company_name)}">
                <div class="name">${escapeHtml(r.company_name)}</div>
                <div class="amount">${formatMoney(r.bid_amount)}</div>
                ${r.license_area ? `<div class="type">${escapeHtml(r.license_area)}</div>` : ''}
            </div>`;
        });
    }

    holdersDiv.innerHTML = html;

    // Wire up company card clicks
    holdersDiv.querySelectorAll('.company-card[data-company-name]').forEach(card => {
        card.addEventListener('click', function() {
            loadCompanyByName(this.dataset.companyName);
        });
    });

    // Switch to holders tab
    const holdersTab = document.querySelector('.detail-tab[data-tab="holders"]');
    if (holdersTab) holdersTab.click();
}

function loadCompanyByName(name) {
    const company = allCompanies.find(c =>
        (c.name && c.name.toLowerCase().includes(name.toLowerCase())) ||
        (c.legal_name && c.legal_name.toLowerCase().includes(name.toLowerCase()))
    );

    // Find all auction results for this company
    const holdings = allAuctionResults.filter(r =>
        r.company_name && r.company_name.toLowerCase().includes(name.toLowerCase())
    ).map(r => {
        const auction = allAuctions.find(a => a.auction_number === r.auction_number);
        return { ...r, auction_name: auction?.auction_name, freq_band: auction?.freq_band,
                 freq_lower_hz: auction?.freq_lower_hz, freq_upper_hz: auction?.freq_upper_hz };
    }).sort((a, b) => (a.freq_lower_hz || 0) - (b.freq_lower_hz || 0));

    const content = document.getElementById('detail-content');
    let html = '';

    if (company) {
        html += `<h2>${escapeHtml(company.name)}</h2>`;
        html += `<div class="detail-section">
            ${company.legal_name ? `<div class="detail-row"><span class="label">Legal Name</span><span class="value">${escapeHtml(company.legal_name)}</span></div>` : ''}
            ${company.parent_company ? `<div class="detail-row"><span class="label">Parent</span><span class="value">${escapeHtml(company.parent_company)}</span></div>` : ''}
            ${company.company_type ? `<div class="detail-row"><span class="label">Type</span><span class="value">${escapeHtml(company.company_type)}</span></div>` : ''}
            ${company.description ? `<div class="detail-row"><span class="label">Description</span><span class="value">${escapeHtml(company.description)}</span></div>` : ''}
            ${company.headquarters ? `<div class="detail-row"><span class="label">HQ</span><span class="value">${escapeHtml(company.headquarters)}</span></div>` : ''}
            ${company.total_spectrum_value ? `<div class="detail-row"><span class="label">Spectrum Value</span><span class="value money">${formatMoney(company.total_spectrum_value)}</span></div>` : ''}
            ${company.govt_contracts ? `<div class="detail-row"><span class="label">Govt Contracts</span><span class="value">${escapeHtml(company.govt_contracts)}</span></div>` : ''}
            ${company.defense_intel_connections ? `<div class="detail-row"><span class="label">Defense/Intel</span><span class="value">${escapeHtml(company.defense_intel_connections)}</span></div>` : ''}
            ${company.subsidiaries ? `<div class="detail-row"><span class="label">Subsidiaries</span><span class="value">${escapeHtml(company.subsidiaries)}</span></div>` : ''}
        </div>`;
    } else {
        html += `<h2>${escapeHtml(name)}</h2><p class="loading">No company profile found.</p>`;
    }

    if (holdings.length > 0) {
        html += '<h3>Spectrum Holdings</h3>';
        let totalSpent = 0;
        holdings.forEach(h => {
            totalSpent += h.bid_amount || 0;
            html += `<div class="auction-item" data-freq-min="${h.freq_lower_hz}" data-freq-max="${h.freq_upper_hz}">
                <div class="auction-name">${escapeHtml(h.auction_name || h.freq_band || 'Auction ' + h.auction_number)}</div>
                <div class="auction-meta">
                    <span style="color:var(--spec-accent-green);font-family:monospace">${formatMoney(h.bid_amount)}</span>
                    ${h.license_area ? `<span>${escapeHtml(h.license_area)}</span>` : ''}
                </div>
            </div>`;
        });
        html += `<div class="detail-row" style="margin-top:8px;font-weight:600">
            <span class="label">Total Spectrum Spend</span>
            <span class="value money">${formatMoney(totalSpent)}</span>
        </div>`;
    }

    content.innerHTML = html;

    // Wire up holding clicks to navigate back to band
    content.querySelectorAll('.auction-item[data-freq-min]').forEach(item => {
        item.addEventListener('click', function() {
            const fMin = parseFloat(this.dataset.freqMin);
            const fMax = parseFloat(this.dataset.freqMax);
            if (fMin && fMax) selectBandByFreq(fMin, fMax);
        });
    });
}

function selectBandByFreq(fMin, fMax) {
    const band = spectrumData.bands.find(b =>
        b.freq_lower_hz <= fMin && b.freq_upper_hz >= fMax
    ) || { freq_lower_hz: fMin, freq_upper_hz: fMax };

    selectBand(band);
}

// ============================================
// NOTES (localStorage)
// ============================================

function saveNote(fMin, fMax) {
    const input = document.getElementById('note-input');
    if (!input || !input.value.trim()) return;

    const notes = getLocalNotes();
    notes.unshift({
        target_type: 'band',
        target_id: `${fMin}-${fMax}`,
        freq_lower_hz: fMin,
        freq_upper_hz: fMax,
        note: input.value.trim(),
        created: new Date().toISOString()
    });
    saveLocalNotes(notes);
    input.value = '';
    loadNotes(fMin, fMax);
}

function loadNotes(fMin, fMax) {
    const allNotes = getLocalNotes();
    const targetId = `${fMin}-${fMax}`;
    const notes = allNotes.filter(n => n.target_id === targetId);
    const list = document.getElementById('notes-list');

    if (!list) return;

    if (notes.length === 0) {
        list.innerHTML = '<p class="loading">No notes for this band yet.</p>';
        return;
    }

    list.innerHTML = notes.map(n => `
        <div style="background:var(--spec-bg-tertiary);border:1px solid var(--spec-border);border-radius:4px;padding:6px;margin-bottom:6px;font-size:11px">
            <div style="color:var(--spec-text-primary)">${escapeHtml(n.note)}</div>
            <div style="color:var(--spec-text-muted);font-size:10px;margin-top:3px">${n.created}</div>
        </div>
    `).join('');
}

// ============================================
// SEARCH (client-side)
// ============================================

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimeout;

searchInput.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    const q = this.value.trim();

    if (q.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    // Check if input is a frequency
    const freqMatch = q.match(/^([\d.]+)\s*(hz|khz|mhz|ghz)?$/i);
    if (freqMatch) {
        let freq = parseFloat(freqMatch[1]);
        const unit = (freqMatch[2] || 'mhz').toLowerCase();
        if (unit === 'ghz') freq *= 1e9;
        else if (unit === 'mhz') freq *= 1e6;
        else if (unit === 'khz') freq *= 1e3;

        const targetBand = spectrumData.bands.find(b => b.freq_lower_hz <= freq && b.freq_upper_hz >= freq);
        if (targetBand) selectBand(targetBand);
        searchResults.style.display = 'none';
        return;
    }

    searchTimeout = setTimeout(() => {
        const results = [];
        const ql = q.toLowerCase();

        // Search allocations
        allAllocations.forEach(a => {
            if ((a.service && a.service.toLowerCase().includes(ql)) ||
                (a.description && a.description.toLowerCase().includes(ql)) ||
                (a.footnotes && a.footnotes.toLowerCase().includes(ql))) {
                if (results.length < 20) {
                    results.push({ type: 'allocation', id: a.id, name: a.service,
                        detail: (a.freq_lower_display || '') + ' - ' + (a.freq_upper_display || ''),
                        freq_lower_hz: a.freq_lower_hz, freq_upper_hz: a.freq_upper_hz });
                }
            }
        });

        // Search companies
        allCompanies.forEach(c => {
            if ((c.name && c.name.toLowerCase().includes(ql)) ||
                (c.legal_name && c.legal_name.toLowerCase().includes(ql)) ||
                (c.description && c.description.toLowerCase().includes(ql))) {
                if (results.length < 40) {
                    results.push({ type: 'company', id: c.id, name: c.name, detail: c.company_type || '' });
                }
            }
        });

        // Search auctions
        allAuctions.forEach(a => {
            if ((a.auction_name && a.auction_name.toLowerCase().includes(ql)) ||
                (a.freq_band && a.freq_band.toLowerCase().includes(ql))) {
                if (results.length < 60) {
                    results.push({ type: 'auction', id: a.auction_number, name: a.auction_name,
                        detail: a.freq_band || '', freq_lower_hz: a.freq_lower_hz, freq_upper_hz: a.freq_upper_hz });
                }
            }
        });

        if (results.length === 0) {
            searchResults.style.display = 'none';
            return;
        }

        searchResults.innerHTML = results.map(r => `
            <div class="search-result-item" data-type="${r.type}" data-id="${r.id}"
                 data-fmin="${r.freq_lower_hz || ''}" data-fmax="${r.freq_upper_hz || ''}"
                 data-name="${escapeHtml(r.name || '')}">
                <span class="search-result-type">${r.type}</span>
                <strong>${escapeHtml(r.name || '')}</strong>
                <span style="color:var(--spec-text-muted);font-size:11px;margin-left:6px">${escapeHtml(r.detail || '')}</span>
            </div>
        `).join('');
        searchResults.style.display = 'block';

        // Wire up search result clicks
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', function() {
                const type = this.dataset.type;
                const fMin = parseFloat(this.dataset.fmin);
                const fMax = parseFloat(this.dataset.fmax);
                const name = this.dataset.name;

                searchResults.style.display = 'none';
                searchInput.value = '';

                if (type === 'allocation' && fMin && fMax) {
                    selectBandByFreq(fMin, fMax);
                } else if (type === 'company') {
                    loadCompanyByName(name);
                } else if (type === 'auction') {
                    loadAuctionDetail(parseInt(this.dataset.id));
                }
            });
        });
    }, 250);
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('#search-box')) {
        searchResults.style.display = 'none';
    }
});

// ============================================
// FILTER BUTTONS
// ============================================

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        activeFilter = this.dataset.filter;
        renderSpectrum(d3.zoomTransform(svg.node()));
    });
});

// ============================================
// ZOOM CONTROLS
// ============================================

document.getElementById('zoom-in').addEventListener('click', () => {
    svg.transition().duration(300).call(zoom.scaleBy, 2);
});

document.getElementById('zoom-out').addEventListener('click', () => {
    svg.transition().duration(300).call(zoom.scaleBy, 0.5);
});

document.getElementById('zoom-reset').addEventListener('click', () => {
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
});

// ============================================
// INITIALIZATION — Load all JSON data files
// ============================================

async function init() {
    try {
        // Load all data in parallel
        const [specBands, allocations, auctions, auctionResults, companies, ismBands, govtAllocs, rulemaking] = await Promise.all([
            fetch(`${DATA_BASE}/spectrum_bands.json`).then(r => r.json()),
            fetch(`${DATA_BASE}/allocations.json`).then(r => r.json()),
            fetch(`${DATA_BASE}/auctions.json`).then(r => r.json()),
            fetch(`${DATA_BASE}/auction_results.json`).then(r => r.json()),
            fetch(`${DATA_BASE}/companies.json`).then(r => r.json()),
            fetch(`${DATA_BASE}/ism_bands.json`).then(r => r.json()),
            fetch(`${DATA_BASE}/govt_allocations.json`).then(r => r.json()),
            fetch(`${DATA_BASE}/rulemaking.json`).then(r => r.json()),
        ]);

        spectrumData = specBands;
        allAllocations = allocations;
        allAuctions = auctions;
        allAuctionResults = auctionResults;
        allCompanies = companies;
        allIsmBands = ismBands;
        allGovtAllocations = govtAllocs;
        allRulemaking = rulemaking;

        // Display stats
        document.getElementById('header-stats').textContent =
            `${allocations.length} bands | ${auctions.length} auctions | ${companies.length} companies`;

        const dbStats = document.getElementById('db-stats');
        if (dbStats) {
            dbStats.innerHTML = `
                <strong>Database Status:</strong><br>
                Allocations: ${allocations.length}<br>
                Auctions: ${auctions.length}<br>
                Auction Results: ${auctionResults.length}<br>
                Companies: ${companies.length}<br>
                ISM Bands: ${ismBands.length}<br>
                Govt Allocations: ${govtAllocs.length}<br>
                Active Rulemaking: ${rulemaking.length}<br>
                Notes: ${getLocalNotes().length} (localStorage)
            `;
        }

        // Initialize visualization
        initSpectrum();

        // Handle resize
        window.addEventListener('resize', () => { initSpectrum(); });
    } catch (err) {
        console.error('Failed to load spectrum data:', err);
        const dbStats = document.getElementById('db-stats');
        if (dbStats) dbStats.innerHTML = '<strong style="color:#f85149">Error loading data files.</strong>';
    }
}

init();
