// ============================================================
// SPECTRUM INTELLIGENCE PLATFORM — Web Version
// Static JSON data, D3.js visualization, vanilla JS
// No framework, no build step, no server
// ============================================================

const DATA_BASE = window.location.pathname.replace(/\/[^/]*$/, '') + '/data';

// Global state
let allAllocations = [], allAuctions = [], allEntities = [], allRelationships = [];
let allBids = [], allProceedings = [], stats = {};
let entityMap = {};  // id → entity

let currentView = 'spectrum';
let selectedBand = null, selectedEntity = null;
let followMoneyActive = false, followMoneyEntity = null, followMoneyData = null;
let history = [];

// D3 spectrum state
let specSvg, specContainer, xScale, zoom, yBandHeight;

// ============================================================
// DATA LOADING
// ============================================================

async function loadData() {
  const [allocations, auctions, entities, relationships, bids, proceedings, s] = await Promise.all([
    fetch(`${DATA_BASE}/allocations.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/auctions.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/entities.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/relationships.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/bids.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/proceedings.json`).then(r => r.json()),
    fetch(`${DATA_BASE}/stats.json`).then(r => r.json()),
  ]);
  allAllocations = allocations;
  allAuctions = auctions;
  allEntities = entities;
  allRelationships = relationships;
  allBids = bids;
  allProceedings = proceedings;
  stats = s;
  entityMap = {};
  entities.forEach(e => entityMap[e.id] = e);
}

// ============================================================
// HELPERS
// ============================================================

function hz(v) {
  if (v >= 1e9) return (v / 1e9).toPrecision(4).replace(/\.?0+$/, '') + ' GHz';
  if (v >= 1e6) return (v / 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' MHz';
  if (v >= 1e3) return (v / 1e3).toPrecision(4).replace(/\.?0+$/, '') + ' kHz';
  return v + ' Hz';
}

function $(n) { if (!n) return '$0'; if (n >= 1e9) return '$' + (n/1e9).toFixed(1) + 'B'; if (n >= 1e6) return '$' + (n/1e6).toFixed(0) + 'M'; if (n >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K'; return '$' + n; }

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'onclick' || k === 'onmousedown') e[k] = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'className') e.className = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else e.setAttribute(k, v);
  });
  children.forEach(c => { if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else if (c) e.appendChild(c); });
  return e;
}

const BAND_COLORS = {
  government: { fill: 'rgba(248,81,73,0.55)', stroke: '#f85149', hover: 'rgba(248,81,73,0.85)' },
  'non-government': { fill: 'rgba(88,166,255,0.55)', stroke: '#58a6ff', hover: 'rgba(88,166,255,0.85)' },
  shared: { fill: 'rgba(188,140,255,0.55)', stroke: '#bc8cff', hover: 'rgba(188,140,255,0.85)' },
  unlicensed: { fill: 'rgba(63,185,80,0.55)', stroke: '#3fb950', hover: 'rgba(63,185,80,0.85)' },
  contested: { fill: 'rgba(210,153,34,0.55)', stroke: '#d29922', hover: 'rgba(210,153,34,0.85)' },
};

const BAND_DESIG = [
  { name: 'VLF', min: 3e3, max: 30e3 }, { name: 'LF', min: 30e3, max: 300e3 },
  { name: 'MF', min: 300e3, max: 3e6 }, { name: 'HF', min: 3e6, max: 30e6 },
  { name: 'VHF', min: 30e6, max: 300e6 }, { name: 'UHF', min: 300e6, max: 3e9 },
  { name: 'SHF', min: 3e9, max: 30e9 }, { name: 'EHF', min: 30e9, max: 300e9 },
];

const FREQ_LANDMARKS = [535e3,1705e3,88e6,108e6,144e6,156.8e6,470e6,614e6,698e6,806e6,902e6,928e6,960e6,1575.42e6,1710e6,1850e6,1930e6,2110e6,2400e6,2500e6,3550e6,3700e6,3980e6,5150e6,5925e6,7125e6,24.25e9,27.5e9,37e9,47.2e9,57e9,71e9];

function genTicks(min, max) {
  const t = [], decades = [1e3,3e3,10e3,30e3,100e3,300e3,1e6,3e6,10e6,30e6,100e6,300e6,1e9,3e9,10e9,30e9,100e9,300e9];
  decades.forEach(d => { if (d >= min * .5 && d <= max * 2) { t.push(d); if (max/min < 100) [1.5,2,5,7].forEach(m => { const v = d*m; if (v >= min && v <= max && v < d*10) t.push(v); }); } });
  FREQ_LANDMARKS.forEach(f => { if (f >= min && f <= max) t.push(f); });
  return [...new Set(t)].sort((a,b) => a - b);
}

// ============================================================
// NAVIGATION
// ============================================================

function pushHistory() { history.push({ view: currentView, band: selectedBand, entity: selectedEntity }); if (history.length > 20) history.shift(); updateBackBtn(); }
function goBack() { if (!history.length) return; const p = history.pop(); currentView = p.view; selectedBand = p.band; selectedEntity = p.entity; renderView(); updateBackBtn(); }
function updateBackBtn() { document.getElementById('back-btn').style.display = history.length > 0 ? '' : 'none'; }

function selectBand(band) { pushHistory(); selectedBand = band; selectedEntity = null; renderDetail(); if (currentView !== 'spectrum') { currentView = 'spectrum'; renderView(); } }
function selectEntity(entity) { if (typeof entity === 'number') entity = entityMap[entity]; if (!entity) return; pushHistory(); selectedEntity = entity; renderDetail(); }
function closeDetail() { selectedBand = null; selectedEntity = null; document.getElementById('detail-panel').classList.remove('open'); }

function setView(v) { currentView = v; selectedBand = null; selectedEntity = null; closeDetail(); renderView(); updateNav(); }

// ============================================================
// FOLLOW THE MONEY
// ============================================================

function activateFollowMoney(entityId) {
  const entity = entityMap[entityId];
  if (!entity) return;
  followMoneyActive = true;
  followMoneyEntity = entity;

  // Collect all related entity IDs
  const relIds = new Set([entityId]);
  allRelationships.forEach(r => {
    if (r.entity_id_from === entityId || r.entity_id_to === entityId) {
      relIds.add(r.entity_id_from); relIds.add(r.entity_id_to);
    }
  });
  // Entities with same parent
  if (entity.ultimate_parent_id) {
    allEntities.forEach(e => { if (e.ultimate_parent_id === entity.ultimate_parent_id) relIds.add(e.id); });
  }
  // Children
  allEntities.forEach(e => { if (e.ultimate_parent_id === entityId) relIds.add(e.id); });

  const relatedEntities = [...relIds].map(id => entityMap[id]).filter(Boolean);
  const holdings = allBids.filter(b => relIds.has(b.entity_id) && b.is_winner);
  const totalSpend = holdings.reduce((s, b) => s + (b.bid_amount || 0), 0);
  const defContracts = []; // Would come from contracts table

  followMoneyData = { entity, relatedEntities, holdings, totalSpend, relIds };

  document.getElementById('ftm-btn').classList.add('active');
  document.getElementById('ftm-label').textContent = entity.name.substring(0, 20);
  renderFollowMoneyPanel();
  document.getElementById('ftm-panel').classList.add('open');

  // Re-render spectrum if visible
  if (currentView === 'spectrum' && specSvg) renderSpectrum(d3.zoomTransform(specSvg.node()));
}

function deactivateFollowMoney() {
  followMoneyActive = false; followMoneyEntity = null; followMoneyData = null;
  document.getElementById('ftm-btn').classList.remove('active');
  document.getElementById('ftm-label').textContent = 'FOLLOW THE MONEY';
  document.getElementById('ftm-panel').classList.remove('open');
  if (currentView === 'spectrum' && specSvg) renderSpectrum(d3.zoomTransform(specSvg.node()));
}

function toggleFollowMoney() {
  if (followMoneyActive) deactivateFollowMoney();
  else document.getElementById('search').focus();
}

function renderFollowMoneyPanel() {
  if (!followMoneyData) return;
  const { entity, relatedEntities, holdings, totalSpend } = followMoneyData;
  const totalMHz = holdings.reduce((s, h) => s + (h.mhz || 0), 0);
  const auctionCount = new Set(holdings.map(h => h.auction_number)).size;

  let html = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;margin-top:20px">
    <span style="color:var(--gold);font-size:16px;font-weight:900">$</span>
    <span style="color:var(--gold);font-size:11px;font-weight:700;letter-spacing:1px">FOLLOW THE MONEY</span>
  </div>
  <h3 style="font-size:13px;font-weight:700;margin-bottom:4px">${esc(entity.name)}</h3>
  <div style="font-size:10px;color:var(--muted);margin-bottom:14px">${esc(entity.industry_description?.substring(0, 100) || '')}</div>
  <div class="stat-grid" style="grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">
    <div class="stat-card gold" style="padding:8px"><div class="stat-value" style="font-size:16px">${$(totalSpend)}</div><div class="stat-label">Total Spend</div></div>
    <div class="stat-card" style="padding:8px"><div class="stat-value" style="font-size:16px">${auctionCount}</div><div class="stat-label">Auctions</div></div>
  </div>
  <div class="section-title">Holdings (${holdings.length})</div>
  <div style="max-height:200px;overflow-y:auto;margin-bottom:14px">`;

  holdings.sort((a, b) => (b.bid_amount || 0) - (a.bid_amount || 0)).slice(0, 20).forEach(h => {
    html += `<div style="padding:3px 0;font-size:10px;display:flex;justify-content:space-between;border-bottom:1px solid var(--bg3)">
      <span style="color:var(--text2)">${esc(h.bands || h.auction_name)}</span><span class="money">${$(h.bid_amount)}</span></div>`;
  });

  html += `</div><div class="section-title">Network (${relatedEntities.length})</div><div style="max-height:250px;overflow-y:auto">`;
  relatedEntities.filter(e => e.id !== entity.id).forEach(re => {
    html += `<div style="padding:4px 0;border-bottom:1px solid var(--bg3);display:flex;justify-content:space-between;align-items:center">
      <div><button class="entity-link" onclick="selectEntity(${re.id})" style="font-size:10px">${esc(re.name)}</button>
      <div style="font-size:8px;color:var(--muted)">${re.status || ''} ${re.is_defense_contractor ? '| DOD' : ''}</div></div>
      ${re.total_spectrum_spend > 0 ? `<span class="money" style="font-size:9px">${$(re.total_spectrum_spend)}</span>` : ''}
    </div>`;
  });
  html += '</div>';
  document.getElementById('ftm-content').innerHTML = html;
}

// ============================================================
// SEARCH
// ============================================================

let searchTimeout = null;
function initSearch() {
  const input = document.getElementById('search');
  const dropdown = document.getElementById('search-dropdown');

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) { dropdown.classList.remove('open'); return; }

    searchTimeout = setTimeout(() => {
      let html = '';

      // Frequency detection
      const fm = q.match(/^([\d.]+)\s*(hz|khz|mhz|ghz)?$/i);
      if (fm) {
        const num = parseFloat(fm[1]);
        const mult = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 }[(fm[2] || 'mhz').toLowerCase()] || 1e6;
        const freq = num * mult;
        const matches = allAllocations.filter(a => a.freq_low_hz <= freq && a.freq_high_hz >= freq).slice(0, 5);
        if (matches.length) {
          html += `<div class="sr-group-title">FREQUENCY: ${hz(freq)}</div>`;
          matches.forEach(a => {
            html += `<div class="sr-item" onmousedown="selectBand(allAllocations[${allAllocations.indexOf(a)}]);closeSearch()">
              <span class="sr-name">${esc(a.freq_low_display)} — ${esc(a.freq_high_display)}</span>
              <span class="sr-meta">${esc(a.service_primary?.substring(0, 30))}</span></div>`;
          });
        }
      } else {
        // Entity search
        const ql = q.toLowerCase();
        const eMatches = allEntities.filter(e => e.name.toLowerCase().includes(ql) || (e.industry_description || '').toLowerCase().includes(ql)).slice(0, 8);
        if (eMatches.length) {
          html += `<div class="sr-group-title">ENTITIES</div>`;
          eMatches.forEach(e => {
            html += `<div class="sr-item">
              <div onmousedown="selectEntity(${e.id});closeSearch()" style="flex:1"><span class="sr-name">${esc(e.name)}</span>
              ${e.is_defense_contractor ? '<span class="defense-flag" style="margin-left:6px">DOD</span>' : ''}</div>
              <button class="sr-follow" onmousedown="event.stopPropagation();activateFollowMoney(${e.id});closeSearch()">$</button></div>`;
          });
        }
        // Band search
        const bMatches = allAllocations.filter(a => (a.service_primary || '').toLowerCase().includes(ql) || (a.description || '').toLowerCase().includes(ql) || (a.band_class || '').toLowerCase().includes(ql)).slice(0, 5);
        if (bMatches.length) {
          html += `<div class="sr-group-title">BANDS</div>`;
          bMatches.forEach(a => {
            html += `<div class="sr-item" onmousedown="selectBand(allAllocations[${allAllocations.indexOf(a)}]);closeSearch()">
              <span class="sr-name">${esc(a.freq_low_display)} — ${esc(a.freq_high_display)}</span>
              <span class="sr-meta">${esc(a.allocation_type)}</span></div>`;
          });
        }
        // Auction search
        const aMatches = allAuctions.filter(a => (a.name || '').toLowerCase().includes(ql) || (a.bands || '').toLowerCase().includes(ql)).slice(0, 4);
        if (aMatches.length) {
          html += `<div class="sr-group-title">AUCTIONS</div>`;
          aMatches.forEach(a => {
            html += `<div class="sr-item"><span class="sr-name">#${a.auction_number}: ${esc(a.name)}</span><span class="sr-meta">${$(a.total_revenue)}</span></div>`;
          });
        }
      }
      dropdown.innerHTML = html;
      dropdown.classList.toggle('open', html.length > 0);
    }, 150);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearch();
    if (e.key === 'Enter') {
      const fm = input.value.match(/^([\d.]+)\s*(hz|khz|mhz|ghz)?$/i);
      if (fm) {
        const freq = parseFloat(fm[1]) * ({ hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 }[(fm[2] || 'mhz').toLowerCase()] || 1e6);
        const match = allAllocations.find(a => a.freq_low_hz <= freq && a.freq_high_hz >= freq);
        if (match) { selectBand(match); closeSearch(); }
      }
    }
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') { e.preventDefault(); goBack(); }
  });

  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) closeSearch(); });
}

function closeSearch() {
  document.getElementById('search-dropdown').classList.remove('open');
  document.getElementById('search').value = '';
  document.getElementById('search').blur();
}

// ============================================================
// SPECTRUM MAP
// ============================================================

let activeFilter = 'all';

function initSpectrum() {
  const container = document.getElementById('spectrum-container');
  if (!container) return;
  const w = container.clientWidth, h = container.clientHeight;

  xScale = d3.scaleLog().domain([3e3, 300e9]).range([0, w]).clamp(true);
  yBandHeight = Math.min(h * 0.6, 220);

  specSvg = d3.select('#spectrum-svg').attr('width', w).attr('height', h);

  zoom = d3.zoom().scaleExtent([1, 10000]).translateExtent([[0,0],[w,h]]).on('zoom', e => renderSpectrum(e.transform));
  specSvg.call(zoom);

  specSvg.on('mousemove', function(event) {
    const [mx] = d3.pointer(event);
    const ns = d3.zoomTransform(this).rescaleX(xScale);
    document.getElementById('freq-indicator').textContent = hz(ns.invert(mx));
  });

  renderSpectrum();

  new ResizeObserver(() => {
    const nw = container.clientWidth, nh = container.clientHeight;
    xScale.range([0, nw]); yBandHeight = Math.min(nh * .6, 220);
    specSvg.attr('width', nw).attr('height', nh);
    zoom.translateExtent([[0,0],[nw,nh]]);
    renderSpectrum(d3.zoomTransform(specSvg.node()));
  }).observe(container);
}

function renderSpectrum(transform = d3.zoomIdentity) {
  if (!specSvg) return;
  const svg = specSvg;
  svg.selectAll('*').remove();
  const w = +svg.attr('width'), h = +svg.attr('height');
  const ns = transform.rescaleX(xScale);
  const g = svg.append('g');
  const bandY = h * 0.15;

  // Axis
  const axG = g.append('g').attr('transform', `translate(0,${bandY + yBandHeight + 5})`);
  const [dMin, dMax] = ns.domain();
  genTicks(dMin, dMax).forEach(f => {
    const x = ns(f);
    if (x >= 0 && x <= w) {
      axG.append('line').attr('x1',x).attr('x2',x).attr('y1',0).attr('y2',6).attr('stroke','#2a2a4a');
      axG.append('text').attr('x',x).attr('y',18).attr('text-anchor','middle').attr('fill','#606078').attr('font-size','10px').attr('font-family','inherit').text(hz(f));
    }
  });

  // Band designations
  BAND_DESIG.forEach(bd => {
    const x1 = ns(bd.min), x2 = ns(bd.max);
    if (x2 > 0 && x1 < w) {
      const cx = (Math.max(x1,0) + Math.min(x2,w)) / 2;
      g.append('text').attr('x',cx).attr('y',bandY-8).attr('text-anchor','middle').attr('fill','#3a3a5a').attr('font-size','11px').attr('font-weight','600').attr('font-family','inherit').text(bd.name);
      if (x1 > 0) g.append('line').attr('x1',x1).attr('x2',x1).attr('y1',bandY-16).attr('y2',bandY+yBandHeight).attr('stroke','#1a1a2e').attr('stroke-dasharray','2,2');
    }
  });

  // Filter
  let bands = allAllocations;
  if (activeFilter === 'ism') {
    const ism = [[902e6,928e6],[2400e6,2500e6],[5150e6,5825e6],[5925e6,7125e6],[57e9,71e9]];
    bands = bands.filter(b => ism.some(r => b.freq_low_hz < r[1] && b.freq_high_hz > r[0]));
  } else if (activeFilter !== 'all') {
    bands = bands.filter(b => b.allocation_type === activeFilter);
  }

  // Draw bands
  bands.forEach(band => {
    const x1 = ns(band.freq_low_hz), x2 = ns(band.freq_high_hz);
    if (x2 < 0 || x1 > w) return;
    const bw = Math.max(x2 - x1, 1);
    const c = BAND_COLORS[band.allocation_type] || BAND_COLORS.shared;
    const isSelected = selectedBand && selectedBand.freq_low_hz === band.freq_low_hz && selectedBand.freq_high_hz === band.freq_high_hz;

    const rect = g.append('rect')
      .attr('x', Math.max(x1,0)).attr('y', bandY)
      .attr('width', Math.min(bw, w - Math.max(x1,0)))
      .attr('height', yBandHeight)
      .attr('fill', c.fill).attr('stroke', isSelected ? '#d4af37' : bw > 3 ? c.stroke : 'none')
      .attr('stroke-width', isSelected ? 2 : .5).attr('cursor','pointer');

    rect.on('mouseenter', function(ev) {
      d3.select(this).attr('fill', c.hover);
      const tip = document.getElementById('band-tooltip');
      tip.innerHTML = `<div style="font-weight:700;color:${c.stroke}">${esc(band.freq_low_display)} — ${esc(band.freq_high_display)}</div>
        <div style="font-size:11px;margin-top:4px">${esc(band.services || band.service_primary || '')}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${esc(band.allocation_type)} | ${esc(band.description?.substring(0,80) || '')}</div>`;
      tip.style.display = 'block';
      const [mx,my] = d3.pointer(ev, document.getElementById('spectrum-container'));
      tip.style.left = Math.min(mx+12, w-320) + 'px'; tip.style.top = (my+12) + 'px';
    });
    rect.on('mouseleave', function() { d3.select(this).attr('fill', c.fill); document.getElementById('band-tooltip').style.display = 'none'; });
    rect.on('click', () => selectBand(band));

    if (bw > 50) {
      g.append('text').attr('x', Math.max(x1,0)+bw/2).attr('y', bandY+yBandHeight/2)
        .attr('text-anchor','middle').attr('dominant-baseline','middle')
        .attr('fill','#e0e0e8').attr('font-size', Math.min(11,bw/8)+'px')
        .attr('font-family','inherit').attr('pointer-events','none')
        .text((band.services||'').split(',')[0]?.trim().substring(0,24)||'');
    }
  });

  // Follow the Money highlights
  if (followMoneyActive && followMoneyData) {
    const holdings = followMoneyData.holdings;
    const auctionFreqs = new Map();
    holdings.forEach(h => {
      const a = allAuctions.find(a => a.auction_number === h.auction_number);
      if (a && a.freq_bands) auctionFreqs.set(h.auction_number, a);
    });

    // Find allocation bands matching auction bands
    const matchedBands = new Set();
    holdings.forEach(h => {
      const bandName = (h.bands || '').toLowerCase();
      allAllocations.forEach(a => {
        if (a.band_class && bandName.includes(a.band_class.toLowerCase())) matchedBands.add(a);
        if (a.is_auctioned && (a.description || '').toLowerCase().includes(bandName)) matchedBands.add(a);
      });
    });

    matchedBands.forEach(band => {
      const x1 = ns(band.freq_low_hz), x2 = ns(band.freq_high_hz);
      if (x2 < 0 || x1 > w) return;
      const bw = Math.max(x2-x1, 3);
      g.append('rect').attr('x',Math.max(x1,0)).attr('y',bandY-6)
        .attr('width',Math.min(bw,w-Math.max(x1,0))).attr('height',yBandHeight+12)
        .attr('fill','rgba(212,175,55,0.25)').attr('stroke','#d4af37').attr('stroke-width',2).attr('pointer-events','none');
    });

    g.append('text').attr('x',w/2).attr('y',14).attr('text-anchor','middle')
      .attr('fill','#d4af37').attr('font-size','13px').attr('font-weight','700').attr('font-family','inherit')
      .text('$ ' + (followMoneyEntity?.name || '') + ' — ' + holdings.length + ' holdings');
  }

  // Legend
  const lg = g.append('g').attr('transform',`translate(10,${h-24})`);
  let lx = 0;
  [['government','Government'],['non-government','Commercial'],['shared','Shared'],['unlicensed','ISM/Unlicensed']].forEach(([k,l]) => {
    const c = BAND_COLORS[k];
    lg.append('rect').attr('x',lx).attr('y',0).attr('width',10).attr('height',10).attr('fill',c.fill).attr('stroke',c.stroke).attr('stroke-width',.5).attr('rx',2);
    lg.append('text').attr('x',lx+14).attr('y',9).attr('fill','#606078').attr('font-size','10px').attr('font-family','inherit').text(l);
    lx += l.length * 7 + 24;
  });
}

// ============================================================
// DETAIL PANEL (Band + Entity)
// ============================================================

function renderDetail() {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  if (!selectedBand && !selectedEntity) { panel.classList.remove('open'); return; }
  panel.classList.add('open');

  if (selectedEntity) {
    renderEntityDetail(content);
  } else if (selectedBand) {
    renderBandDetail(content);
  }
}

function renderBandDetail(el) {
  const b = selectedBand;
  const c = BAND_COLORS[b.allocation_type] || BAND_COLORS.shared;

  // Find auctions for this band
  const bandAuctions = allAuctions.filter(a => {
    const bc = (b.band_class || '').toLowerCase();
    return (a.bands || '').toLowerCase().includes(bc) || (a.name || '').toLowerCase().includes(bc);
  });

  // Proceedings
  const procs = allProceedings.filter(p => p.freq_low_hz && p.freq_high_hz && p.freq_low_hz <= b.freq_high_hz && p.freq_high_hz >= b.freq_low_hz);

  let html = `<div style="margin-top:20px">
    <div style="display:inline-block;width:10px;height:10px;background:${c.stroke};border-radius:2px;margin-right:6px;vertical-align:middle"></div>
    <span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:${c.stroke}">${esc(b.allocation_type)}</span>
    <h2 style="font-size:15px;font-weight:700;margin-top:6px">${esc(b.freq_low_display)} — ${esc(b.freq_high_display)}</h2>
    <div style="font-size:11px;color:var(--text2);margin-top:4px">${esc(b.service_primary || b.services || '')}</div>
    ${b.description ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">${esc(b.description)}</div>` : ''}
  </div>`;

  // Tabs
  html += `<div class="tab-bar" style="margin-top:14px">
    <button class="tab-btn active" onclick="showBandTab(this,'band-alloc')">Allocation</button>
    <button class="tab-btn" onclick="showBandTab(this,'band-auctions')">Auctions (${bandAuctions.length})</button>
    <button class="tab-btn" onclick="showBandTab(this,'band-regulatory')">Regulatory (${procs.length})</button>
  </div>`;

  // Allocation tab
  html += `<div id="band-alloc" class="band-tab-content">
    <div class="card"><table style="font-size:11px;width:100%">
    ${[['Primary',b.service_primary],['Secondary',b.service_secondary],['Footnotes',b.itu_footnotes],['CFR',b.regulatory_citation],['Band Class',b.band_class],['Auctioned',b.is_auctioned?'Yes':'No']].filter(([,v])=>v).map(([l,v])=>`<tr><td style="color:var(--muted);padding:3px 8px;width:100px">${l}</td><td style="padding:3px 8px;color:var(--text2)">${esc(String(v))}</td></tr>`).join('')}
    </table></div></div>`;

  // Auctions tab
  html += `<div id="band-auctions" class="band-tab-content" style="display:none">`;
  if (bandAuctions.length === 0) {
    html += '<div style="color:var(--muted);padding:16px;text-align:center">No auctions for this band</div>';
  } else {
    bandAuctions.forEach(a => {
      const bids = allBids.filter(bid => bid.auction_number === a.auction_number);
      const winners = bids.filter(bid => bid.is_winner);
      const losers = bids.filter(bid => !bid.is_winner);
      html += `<div class="card" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between"><span class="card-title">Auction ${a.auction_number}: ${esc(a.name)}</span><span class="money">${$(a.total_revenue)}</span></div>
        <div style="font-size:10px;color:var(--muted);margin-top:3px">${a.start_date} | ${a.num_bidders} bidders | ${a.num_winners} winners</div>`;

      if (winners.length) {
        html += `<div style="margin-top:8px;font-size:9px;color:var(--gold);font-weight:600;letter-spacing:1px">WINNERS</div>`;
        winners.slice(0,10).forEach(bid => {
          html += `<div style="padding:3px 0;display:flex;justify-content:space-between;border-bottom:1px solid var(--bg3)">
            <div><span style="color:var(--gold);margin-right:4px;font-weight:700">$</span>${bid.entity_id ? `<button class="entity-link" onclick="selectEntity(${bid.entity_id})">${esc(bid.entity_name||bid.bidder_name)}</button>` : esc(bid.bidder_name)}
            ${bid.is_defense_contractor ? '<span class="defense-flag" style="margin-left:4px">DOD</span>' : ''}</div>
            <span style="color:var(--gold);font-weight:600;font-size:11px">${$(bid.bid_amount)}</span></div>`;
        });
      }
      if (losers.length) {
        html += `<div style="margin-top:6px;font-size:9px;color:var(--muted);letter-spacing:1px">OTHER BIDDERS (${losers.length})</div>`;
        losers.slice(0,8).forEach(bid => {
          html += `<div style="padding:2px 0;display:flex;justify-content:space-between;opacity:.7;font-size:11px">
            <span>${bid.entity_id ? `<button class="entity-link" onclick="selectEntity(${bid.entity_id})">${esc(bid.entity_name||bid.bidder_name)}</button>` : esc(bid.bidder_name)}</span>
            <span style="color:var(--muted)">${$(bid.bid_amount)}</span></div>`;
        });
      }
      html += '</div>';
    });
  }
  html += '</div>';

  // Regulatory tab
  html += `<div id="band-regulatory" class="band-tab-content" style="display:none">`;
  if (procs.length === 0) {
    html += '<div style="color:var(--muted);padding:16px;text-align:center">No proceedings</div>';
  } else {
    procs.forEach(p => {
      html += `<div class="card" style="border-left:3px solid var(--amber)">
        <div style="margin-bottom:4px"><span class="badge badge-amber">${esc(p.proceeding_type)}</span> <span class="badge badge-${p.status==='open'?'amber':'green'}">${esc(p.status)}</span></div>
        <div class="card-title">${esc(p.docket_number)}: ${esc(p.title)}</div>
        <div style="font-size:10px;color:var(--text2);margin-top:4px;line-height:1.7">${esc(p.description?.substring(0,300))}</div>
        <div style="font-size:9px;color:var(--muted);margin-top:4px">Filed: ${p.filing_date}</div></div>`;
    });
  }
  html += '</div>';

  el.innerHTML = html;
}

function showBandTab(btn, id) {
  btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.band-tab-content').forEach(d => d.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

function renderEntityDetail(el) {
  const e = selectedEntity;
  const rels = allRelationships.filter(r => r.entity_id_from === e.id || r.entity_id_to === e.id);
  const bids = allBids.filter(b => b.entity_id === e.id);
  const wins = bids.filter(b => b.is_winner);
  const parent = e.ultimate_parent_id ? entityMap[e.ultimate_parent_id] : null;

  let html = `<div style="margin-top:20px">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      <span class="badge badge-${e.status==='active'?'green':e.status==='acquired'?'amber':'red'}">${esc(e.status||'unknown')}</span>
      ${e.is_defense_contractor ? '<span class="badge badge-red">DOD</span>' : ''}
      ${e.is_intel_community ? '<span class="badge badge-red">IC</span>' : ''}
    </div>
    <h2 style="font-size:14px;font-weight:700">${esc(e.name)}</h2>
    ${parent ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">Parent: <button class="entity-link" onclick="selectEntity(${parent.id})">${esc(parent.name)}</button></div>` : ''}
    <div style="font-size:10px;color:var(--muted);margin-top:4px;line-height:1.6">${esc(e.industry_description?.substring(0,300)||'')}</div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button class="sr-follow" onclick="activateFollowMoney(${e.id})">$ Follow the Money</button>
    </div>
  </div>`;

  // Stats
  html += `<div class="stat-grid" style="grid-template-columns:1fr 1fr;gap:6px;margin:14px 0">
    <div class="stat-card gold" style="padding:8px"><div class="stat-value" style="font-size:16px">${$(e.total_spectrum_spend)}</div><div class="stat-label">Spend</div></div>
    <div class="stat-card" style="padding:8px"><div class="stat-value" style="font-size:16px">${e.auction_count||0}</div><div class="stat-label">Auctions</div></div>
  </div>`;

  // Tabs
  html += `<div class="tab-bar">
    <button class="tab-btn active" onclick="showBandTab(this,'ent-rels')">Relationships (${rels.length})</button>
    <button class="tab-btn" onclick="showBandTab(this,'ent-bids')">Bids (${bids.length})</button>
  </div>`;

  // Relationships
  html += `<div id="ent-rels" class="band-tab-content">`;
  if (rels.length === 0) {
    html += '<div style="color:var(--muted);padding:16px;text-align:center">No relationships</div>';
  } else {
    rels.slice(0, 30).forEach(r => {
      const other = r.entity_id_from === e.id ? { id: r.entity_id_to, name: r.to_name } : { id: r.entity_id_from, name: r.from_name };
      html += `<div class="card" style="padding:8px">
        <span class="badge badge-purple" style="margin-right:6px">${esc(r.relationship_type)}</span>
        <button class="entity-link" onclick="selectEntity(${other.id})">${esc(other.name)}</button>
        ${r.relationship_detail ? `<div style="font-size:9px;color:var(--muted);margin-top:3px">${esc(r.relationship_detail.substring(0,120))}</div>` : ''}
      </div>`;
    });
  }
  html += '</div>';

  // Bids
  html += `<div id="ent-bids" class="band-tab-content" style="display:none">`;
  if (bids.length === 0) {
    html += '<div style="color:var(--muted);padding:16px;text-align:center">No bids</div>';
  } else {
    html += '<table class="data-table"><thead><tr><th>Auction</th><th>Band</th><th>Amount</th><th>Result</th></tr></thead><tbody>';
    bids.forEach(b => {
      html += `<tr class="${b.is_winner ? 'winner' : ''}">
        <td style="font-size:10px">#${b.auction_number}</td>
        <td style="font-size:10px">${esc(b.bands||'')}</td>
        <td class="money">${$(b.bid_amount)}</td>
        <td><span class="badge ${b.is_winner?'badge-gold':'badge-red'}">${b.is_winner?'WON':'LOST'}</span></td></tr>`;
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  el.innerHTML = html;
}

// ============================================================
// ENTITY GRAPH
// ============================================================

function renderGraph() {
  const container = document.getElementById('main-view');
  container.innerHTML = `<div style="width:100%;height:100%;position:relative">
    <div class="graph-controls"><button class="graph-ctrl-btn" id="graph-defense-btn" onclick="toggleGraphDefense()">ALL ENTITIES</button>
    <button class="graph-ctrl-btn" onclick="resetGraph()">Reset</button></div>
    <svg id="graph-svg" class="graph-svg"></svg>
    <div class="graph-legend"><div style="color:var(--muted);margin-bottom:4px;font-weight:600;letter-spacing:1px">EDGES</div>
    ${Object.entries({
      'parent-subsidiary':'#58a6ff','acquisition':'#f85149','merger':'#ff6666',
      'shared-officers':'#bc8cff','joint-venture':'#3fb950','spectrum-lease':'#d4af37','co-bidder':'#555577'
    }).map(([k,c])=>`<div style="display:flex;align-items:center;gap:4px;margin-bottom:1px"><div style="width:12px;height:2px;background:${c}"></div><span style="color:var(--text2)">${k}</span></div>`).join('')}
    </div></div>`;
  drawGraph(false);
}

let graphDefenseOnly = false;
function toggleGraphDefense() {
  graphDefenseOnly = !graphDefenseOnly;
  document.getElementById('graph-defense-btn').textContent = graphDefenseOnly ? 'DEFENSE ONLY' : 'ALL ENTITIES';
  document.getElementById('graph-defense-btn').classList.toggle('active', graphDefenseOnly);
  drawGraph(graphDefenseOnly);
}
function resetGraph() { graphDefenseOnly = false; drawGraph(false); }

function drawGraph(defenseOnly) {
  const svg = d3.select('#graph-svg');
  svg.selectAll('*').remove();
  const w = svg.node()?.clientWidth || 800, h = svg.node()?.clientHeight || 600;

  let nodes = allEntities.filter(e => e.total_spectrum_spend > 0 || e.is_defense_contractor).slice(0, 80).map(n => ({...n}));
  if (defenseOnly) nodes = nodes.filter(n => n.is_defense_contractor || n.is_intel_community);

  const nodeIds = new Set(nodes.map(n => n.id));
  let edges = allRelationships.filter(r => nodeIds.has(r.entity_id_from) && nodeIds.has(r.entity_id_to) && r.relationship_type !== 'co-bidder')
    .map(r => ({ ...r, source: r.entity_id_from, target: r.entity_id_to }));

  const followIds = followMoneyActive && followMoneyData ? followMoneyData.relIds : new Set();
  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([.1,8]).on('zoom', e => g.attr('transform', e.transform)));

  const REL_C = {'parent-subsidiary':'#58a6ff',acquisition:'#f85149',merger:'#ff6666','shared-officers':'#bc8cff','joint-venture':'#3fb950','spectrum-lease':'#d4af37','co-bidder':'#555577',affiliate:'#44aacc'};
  const rad = d => { const s=d.total_spectrum_spend||0; return s>50e9?24:s>10e9?18:s>1e9?14:s>100e6?10:s>0?7:4; };
  const col = d => { if(followIds.has(d.id))return'#d4af37'; if(d.is_defense_contractor&&d.is_intel_community)return'#ff2222'; if(d.is_defense_contractor)return'#ff6644'; if(d.status==='dissolved'||d.status==='acquired')return'#555'; return(d.total_spectrum_spend||0)>10e9?'#58a6ff':(d.total_spectrum_spend||0)>1e9?'#3fb950':'#8888aa'; };

  const link = g.selectAll('line').data(edges).enter().append('line')
    .attr('stroke', d => REL_C[d.relationship_type]||'#444')
    .attr('stroke-width', d => d.relationship_type==='parent-subsidiary'?2:1)
    .attr('stroke-opacity', .4);

  const node = g.selectAll('.node').data(nodes).enter().append('g')
    .call(d3.drag().on('start',(e,d)=>{if(!e.active)sim.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y})
      .on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y}).on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null}));

  node.append('circle').attr('r',rad).attr('fill',col).attr('stroke',d=>followIds.has(d.id)?'#d4af37':'rgba(255,255,255,.08)').attr('stroke-width',1).attr('cursor','pointer')
    .on('click',(e,d)=>{e.stopPropagation();selectEntity(d)})
    .on('dblclick',(e,d)=>{e.stopPropagation();selectEntity(d);svg.transition().duration(500).call(d3.zoom().transform,d3.zoomIdentity.translate(w/2-d.x,h/2-d.y))})
    .on('contextmenu',(e,d)=>{e.preventDefault();showContextMenu(e.clientX,e.clientY,d)});

  node.append('text').attr('dy',d=>rad(d)+12).attr('text-anchor','middle').attr('fill',d=>followIds.has(d.id)?'#d4af37':'#808098')
    .attr('font-size',d=>rad(d)>14?'10px':'8px').attr('font-family','inherit').attr('pointer-events','none')
    .text(d=>(d.name||'').substring(0,20));

  node.filter(d=>(d.total_spectrum_spend||0)>1e9).append('text').attr('dy',d=>-(rad(d)+4)).attr('text-anchor','middle')
    .attr('fill','#4a4a6a').attr('font-size','8px').attr('font-family','inherit').attr('pointer-events','none')
    .text(d=>$(d.total_spectrum_spend));

  const sim = d3.forceSimulation(nodes)
    .force('link',d3.forceLink(edges).id(d=>d.id).distance(d=>d.relationship_type==='parent-subsidiary'?50:100))
    .force('charge',d3.forceManyBody().strength(d=>-(rad(d)*12+30)))
    .force('center',d3.forceCenter(w/2,h/2).strength(.05))
    .force('collision',d3.forceCollide().radius(d=>rad(d)+8))
    .on('tick',()=>{
      link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      node.attr('transform',d=>`translate(${d.x},${d.y})`);
    });
}

function showContextMenu(x, y, entity) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = `<button class="ctx-item" onclick="selectEntity(${entity.id});hideContextMenu()">View: ${esc(entity.name?.substring(0,25))}</button>
    <button class="ctx-item gold" onclick="activateFollowMoney(${entity.id});hideContextMenu()">$ Follow the Money</button>
    <div class="ctx-divider"></div>
    <div style="padding:4px 10px;font-size:9px;color:var(--muted)">${$(entity.total_spectrum_spend)} | ${entity.is_defense_contractor?'DOD':''} ${entity.status||''}</div>`;
  menu.style.left = x+'px'; menu.style.top = y+'px'; menu.style.display = 'block';
}
function hideContextMenu() { document.getElementById('context-menu').style.display = 'none'; }

// ============================================================
// SPECIAL VIEWS (Defense, Ghosts, Timeline, 902 MHz)
// ============================================================

function renderDefenseView() {
  const c = document.getElementById('main-view');
  const defEntities = allEntities.filter(e => e.is_defense_contractor || e.is_intel_community).sort((a,b) => (b.total_spectrum_spend||0) - (a.total_spectrum_spend||0));
  let html = `<div class="view-container"><h1 style="font-size:16px;font-weight:700;color:var(--red);margin-bottom:4px">DEFENSE / INTELLIGENCE MAP</h1>
    <p style="font-size:11px;color:var(--muted);margin-bottom:16px">Entities with documented DOD, NSA, CIA, DHS, NRO, NGA, or IC connections.</p>
    <div class="stat-grid"><div class="stat-card red"><div class="stat-value">${defEntities.length}</div><div class="stat-label">Defense/IC Entities</div></div>
    <div class="stat-card blue"><div class="stat-value">${defEntities.filter(e=>e.is_intel_community).length}</div><div class="stat-label">Intel Community</div></div></div>
    <table class="data-table"><thead><tr><th>Entity</th><th>Spend</th><th>Status</th><th>Intel</th><th></th></tr></thead><tbody>`;
  defEntities.forEach(e => {
    html += `<tr class="defense"><td><button class="entity-link" onclick="selectEntity(${e.id})">${esc(e.name)}</button>
      <div style="font-size:8px;color:var(--muted)">${esc(e.industry_description?.substring(0,60)||'')}</div></td>
      <td class="money">${$(e.total_spectrum_spend)}</td>
      <td><span class="badge badge-${e.status==='active'?'green':'amber'}">${esc(e.status)}</span></td>
      <td>${e.is_intel_community?'<span class="defense-flag">IC</span>':''}</td>
      <td><button class="sr-follow" onclick="activateFollowMoney(${e.id})">$</button></td></tr>`;
  });
  html += '</tbody></table></div>';
  c.innerHTML = html;
}

function renderGhostsView() {
  const c = document.getElementById('main-view');
  const ghosts = allEntities.filter(e => ['dissolved','acquired','merged'].includes(e.status)).sort((a,b) => (b.total_spectrum_spend||0) - (a.total_spectrum_spend||0));
  let html = `<div class="view-container"><h1 style="font-size:16px;font-weight:700;color:var(--muted);margin-bottom:4px">GHOST COMPANIES</h1>
    <p style="font-size:11px;color:var(--muted);margin-bottom:16px">Entities that bid, then dissolved, merged, or went silent.</p>
    <table class="data-table"><thead><tr><th>Entity</th><th>Status</th><th>Spend</th><th>Auctions</th><th></th></tr></thead><tbody>`;
  ghosts.forEach(e => {
    html += `<tr class="ghost"><td><button class="entity-link" onclick="selectEntity(${e.id})">${esc(e.name)}</button></td>
      <td><span class="badge badge-${e.status==='acquired'?'amber':e.status==='merged'?'purple':'red'}">${esc(e.status)}</span></td>
      <td class="money">${$(e.total_spectrum_spend)}</td>
      <td>${e.auction_count||0}</td>
      <td><button class="sr-follow" onclick="activateFollowMoney(${e.id})">$</button></td></tr>`;
  });
  html += '</tbody></table></div>';
  c.innerHTML = html;
}

function renderTimelineView() {
  const c = document.getElementById('main-view');
  c.innerHTML = '<div style="width:100%;height:100%"><svg id="timeline-svg" style="width:100%;height:100%"></svg></div>';
  const svg = d3.select('#timeline-svg');
  const w = svg.node().clientWidth, h = svg.node().clientHeight;
  const margin = {top:40,right:40,bottom:60,left:80};

  const data = allAuctions.filter(a => a.start_date && a.total_revenue > 0)
    .map(a => ({...a, date: d3.timeParse('%Y-%m-%d')(a.start_date)})).filter(a => a.date);

  const x = d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([margin.left,w-margin.right]);
  const y = d3.scaleLog().domain([d3.min(data,d=>Math.max(1e5,d.total_revenue)),d3.max(data,d=>d.total_revenue)]).range([h-margin.bottom,margin.top]);
  const r = d3.scaleSqrt().domain([0,d3.max(data,d=>d.num_licenses||1)]).range([3,25]);

  svg.selectAll('.bubble').data(data).enter().append('circle')
    .attr('cx',d=>x(d.date)).attr('cy',d=>y(d.total_revenue)).attr('r',d=>r(d.num_licenses||1))
    .attr('fill',d=>d.total_revenue>40e9?'#d4af37':d.total_revenue>10e9?'#58a6ff':d.total_revenue>1e9?'#3fb950':'#666688')
    .attr('fill-opacity',.7).attr('stroke','rgba(255,255,255,.1)').attr('cursor','pointer')
    .on('click',(e,d)=>{/* could show auction detail */});

  data.filter(d=>d.total_revenue>5e9).forEach(d=>{
    svg.append('text').attr('x',x(d.date)).attr('y',y(d.total_revenue)-r(d.num_licenses||1)-6)
      .attr('text-anchor','middle').attr('fill','#a0a0b8').attr('font-size','9px').attr('font-family','inherit')
      .text(`#${d.auction_number}: ${$(d.total_revenue)}`);
  });

  svg.append('g').attr('transform',`translate(0,${h-margin.bottom})`).call(d3.axisBottom(x).ticks(d3.timeYear.every(2)))
    .selectAll('text').attr('fill','#606078').attr('font-family','inherit').attr('font-size','10px');
  svg.append('g').attr('transform',`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d=>$(d)))
    .selectAll('text').attr('fill','#606078').attr('font-family','inherit').attr('font-size','10px');
  svg.selectAll('.domain,.tick line').attr('stroke','#2a2a4a');

  svg.append('text').attr('x',w/2).attr('y',20).attr('text-anchor','middle').attr('fill','var(--text)').attr('font-size','14px').attr('font-weight','700').attr('font-family','inherit').text('FCC SPECTRUM AUCTIONS 1994-PRESENT');
}

function render902View() {
  const c = document.getElementById('main-view');
  const bands902 = allAllocations.filter(a => a.freq_low_hz >= 890e6 && a.freq_high_hz <= 960e6);
  const procs = allProceedings.filter(p => p.freq_low_hz >= 890e6 && p.freq_high_hz <= 930e6);
  const useCases = [
    {name:'LoRa/LoRaWAN',desc:'Long-range IoT (900 MHz ISM)',part:'Part 15',risk:'CRITICAL'},
    {name:'Z-Wave',desc:'Home automation (908.42 MHz)',part:'Part 15',risk:'CRITICAL'},
    {name:'RFID (UHF)',desc:'Supply chain, retail inventory',part:'Part 15',risk:'CRITICAL'},
    {name:'SCADA/Utility',desc:'Grid monitoring and control',part:'Part 15/90',risk:'CRITICAL'},
    {name:'Amateur (33cm)',desc:'902-928 MHz ham band',part:'Part 97',risk:'HIGH'},
    {name:'NextNav (proposed)',desc:'Terrestrial PNT/GPS backup',part:'Proposed',risk:'PETITIONER'},
    {name:'Anterix (adjacent)',desc:'900 MHz utility broadband',part:'Part 90',risk:'MEDIUM'},
  ];

  let html = `<div class="view-container">
    <h1 style="font-size:16px;font-weight:700;color:var(--amber);margin-bottom:4px">902-928 MHz DEEP DIVE</h1>
    <p style="font-size:11px;color:var(--text2);margin-bottom:16px">The most contested ISM band. NextNav vs 40,000+ opposing comments. FCC Docket 24-240.</p>
    <div class="stat-grid">
      <div class="stat-card" style="border-color:var(--amber)"><div class="stat-value" style="color:var(--amber)">26 MHz</div><div class="stat-label">Bandwidth</div></div>
      <div class="stat-card"><div class="stat-value">${useCases.length}</div><div class="stat-label">Use Cases</div></div>
      <div class="stat-card red"><div class="stat-value">${procs.length}</div><div class="stat-label">Proceedings</div></div>
      <div class="stat-card"><div class="stat-value">40,000+</div><div class="stat-label">Comments Filed</div></div>
    </div>
    <div class="section-title">CURRENT USE CASES</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px;margin-bottom:16px">`;

  useCases.forEach(u => {
    const riskClass = u.risk === 'CRITICAL' ? 'color:var(--red);font-weight:700' : u.risk === 'HIGH' ? 'color:var(--amber);font-weight:600' : 'color:var(--muted)';
    html += `<div class="card"><div class="card-title">${esc(u.name)}</div>
      <div style="font-size:10px;color:var(--muted);margin:4px 0">${esc(u.desc)}</div>
      <div style="display:flex;justify-content:space-between"><span class="badge badge-blue">${u.part}</span><span style="${riskClass};font-size:10px">${u.risk}</span></div></div>`;
  });

  html += `</div><div class="section-title">KEY ENTITIES</div>`;
  const nextnav = allEntities.find(e => e.name.includes('NextNav'));
  const anterix = allEntities.find(e => e.name.includes('Anterix'));
  if (nextnav) html += `<div class="card" style="border-left:3px solid var(--amber)"><div style="display:flex;justify-content:space-between"><button class="entity-link" onclick="selectEntity(${nextnav.id})">${esc(nextnav.name)}</button><span class="badge badge-amber">PETITIONER</span></div><div style="font-size:10px;color:var(--muted);margin-top:4px">${esc(nextnav.industry_description?.substring(0,150)||'')}</div></div>`;
  if (anterix) html += `<div class="card" style="border-left:3px solid var(--blue)"><div style="display:flex;justify-content:space-between"><button class="entity-link" onclick="selectEntity(${anterix.id})">${esc(anterix.name)}</button><span class="badge badge-blue">900 MHz HOLDER</span></div><div style="font-size:10px;color:var(--muted);margin-top:4px">${esc(anterix.industry_description?.substring(0,150)||'')}</div></div>`;

  html += `<div class="section-title" style="margin-top:16px">REGULATORY PROCEEDINGS</div>`;
  procs.forEach(p => {
    html += `<div class="card" style="border-left:3px solid var(--amber)"><span class="badge badge-amber">${esc(p.proceeding_type)}</span> <span class="badge badge-${p.status==='open'?'amber':'green'}">${esc(p.status)}</span>
      <div class="card-title" style="margin-top:4px">${esc(p.docket_number)}: ${esc(p.title)}</div>
      <div style="font-size:10px;color:var(--text2);margin-top:4px;line-height:1.6">${esc(p.description?.substring(0,250))}</div></div>`;
  });

  html += '</div>';
  c.innerHTML = html;
}

// ============================================================
// VIEW RENDERING
// ============================================================

const VIEWS = {spectrum:'Spectrum',graph:'Graph',timeline:'Timeline',defense:'Defense',ghosts:'Ghosts','902mhz':'902 MHz'};

function updateNav() {
  document.getElementById('nav').innerHTML = Object.entries(VIEWS).map(([k,l]) =>
    `<button class="nav-btn ${currentView===k?'active':''}" onclick="setView('${k}')">${l}</button>`
  ).join('');
}

function renderView() {
  updateNav();
  const mv = document.getElementById('main-view');

  if (currentView === 'spectrum') {
    mv.innerHTML = `<div id="spectrum-container" style="width:100%;height:100%;position:relative;overflow:hidden">
      <svg id="spectrum-svg"></svg>
      <div id="freq-indicator" style="position:absolute;top:8px;right:8px;color:var(--gold);font-weight:600;font-size:12px">—</div>
      <div class="spectrum-controls">
        <button class="zoom-btn" onclick="specSvg.transition().duration(300).call(zoom.scaleBy,2)">+</button>
        <button class="zoom-btn" onclick="specSvg.transition().duration(300).call(zoom.scaleBy,.5)">−</button>
        <button class="zoom-btn" onclick="specSvg.transition().duration(300).call(zoom.transform,d3.zoomIdentity)">⌂</button>
      </div>
      <div class="filter-bar">
        ${['all','government','non-government','shared','ism'].map(f =>
          `<button class="nav-btn ${activeFilter===f?'active':''}" onclick="activeFilter='${f}';renderSpectrum(d3.zoomTransform(specSvg.node()));document.querySelectorAll('.filter-bar .nav-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">${f==='all'?'All':f==='non-government'?'Commercial':f==='ism'?'ISM':f.charAt(0).toUpperCase()+f.slice(1)}</button>`
        ).join('')}
      </div>
    </div>`;
    requestAnimationFrame(initSpectrum);
  } else if (currentView === 'graph') {
    renderGraph();
  } else if (currentView === 'timeline') {
    renderTimelineView();
  } else if (currentView === 'defense') {
    renderDefenseView();
  } else if (currentView === 'ghosts') {
    renderGhostsView();
  } else if (currentView === '902mhz') {
    render902View();
  }

  if (selectedBand || selectedEntity) renderDetail();
}

// ============================================================
// INIT
// ============================================================

async function init() {
  await loadData();

  // Header stats
  document.getElementById('header-stats').innerHTML =
    `${stats.totalAllocations} bands | ${stats.totalEntities} entities | ${$(stats.totalRevenue)}`;

  initSearch();
  updateNav();
  renderView();

  document.addEventListener('click', e => { if (!e.target.closest('.context-menu')) hideContextMenu(); });

  console.log('[SPECTRUM-INTEL] Loaded:', stats);
}

init();
