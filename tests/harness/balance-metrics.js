// ─── Balance metrics ──────────────────────────────────────────────────────────
// Scores how visually balanced the currently-rendered Screen is, from DOM geometry alone.
// Finds "ink" (anything that visibly draws: text, cards, beveled boxes, images), projects it
// onto the panel's vertical axis, and reads the empty bands between ink as the felt the eye
// sees. From the bands it computes:
//   maxBandPct / poolExcessPct · the largest dead band BETWEEN sections, and how far it
//                 exceeds the second-largest, % of panel height. Pooling scores the EXCESS:
//                 one dominant void reads as clumped, while several similar bands read as
//                 intentional spacing. Edge bands are excluded (a centered screen is not
//                 penalized for symmetric margins), and the modifier banner counts as chrome.
//   edgeAsymPct · |top gap − bottom gap|, % of panel height (content floats high or low)
//   innerGapCV  · coefficient of variation of the gaps BETWEEN sections (uneven rhythm)
//   fillPct     · ink span / panel height (content too small for its space)
// plus per-role element positions (see balance-roles.js) for cross-screen stay-put checks.
//
// Returns numbers and a 0–100 score (higher = worse); asserts nothing. Consumers:
// the lab frame overlay (lab/frame.html?balance=1) and the headless sweep
// (tests/harness/balance-audit.js). Loads after layout-measure.js and balance-roles.js.
// SCORE weights are starting values, tuned during calibration against known-off screens.

(function (root) {
  'use strict';

  const SCORE = {
    poolStartPct: 6, poolWeight: 2, poolCap: 45,
    asymStartPct: 8,  asymWeight: 1.2, asymCap: 30,
    cvStart: 45,      cvWeight: 0.35,  cvCap: 25,
    fillFloorPct: 55, fillWeight: 0.9, fillCap: 25,
    flagAt: 25, // cells scoring at or above this are flagged in reports
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round1 = v => Math.round(v * 10) / 10;

  function elName(el) {
    if (el.id) return '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    return cls ? '.' + cls.split(/\s+/)[0] : el.tagName.toLowerCase();
  }

  // Does this element visibly draw anything on its own (ignoring descendants)?
  // Text nodes, media, any background fill, a border, or a box-shadow (the bevel system
  // draws entirely with inset shadows, so beveled boxes register here).
  function hasInk(el, cs) {
    if (/^(IMG|CANVAS|VIDEO|svg)$/i.test(el.tagName)) return true;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    if (cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    if ((parseFloat(cs.borderTopWidth) || 0) > 0 || (parseFloat(cs.borderBottomWidth) || 0) > 0 ||
        (parseFloat(cs.borderLeftWidth) || 0) > 0 || (parseFloat(cs.borderRightWidth) || 0) > 0) return true;
    const m = (cs.backgroundColor || '').match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',');
      if (parts.length < 4 || parseFloat(parts[3]) > 0.05) return true;
    }
    return false;
  }

  // Measure the rendered Screen. Returns null when no .panel is on screen.
  function measure() {
    const panel = document.querySelector('.panel');
    if (!panel) return null;
    const z = (root.LayoutMeasure && LayoutMeasure.appZoom()) || 1;
    const pr = panel.getBoundingClientRect();
    const pcs = getComputedStyle(panel);
    let top = pr.top + (parseFloat(pcs.paddingTop) || 0);
    const bottom = pr.bottom - (parseFloat(pcs.paddingBottom) || 0);
    // The modifier banner is chrome pinned to the panel top, not content: measure from
    // below it, so the banner→content gap counts as a top EDGE band (judged by symmetry)
    // rather than as inner pooling. A centered dialog under a banner is balanced.
    const banner = panel.querySelector('.mod-banner');
    if (banner) {
      const br = banner.getBoundingClientRect();
      if (br.height > 0) top = Math.max(top, br.bottom);
    }
    const H = (bottom - top) / z;

    // Collect ink as vertical intervals, clipped to the panel's padding box.
    let ivs = [];
    for (const el of panel.querySelectorAll('*')) {
      if (el.closest('.balance-overlay') || el.closest('.mod-banner')) continue;
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      if (!hasInk(el, cs)) continue;
      const y0 = Math.max(r.top, top), y1 = Math.min(r.bottom, bottom);
      if (y1 > y0) ivs.push({ y0, y1, name: elName(el) });
    }
    ivs.sort((a, b) => a.y0 - b.y0);

    // Merge overlapping/touching intervals into solid ink runs.
    const runs = [];
    for (const iv of ivs) {
      const last = runs[runs.length - 1];
      if (last && iv.y0 <= last.y1 + 0.5) {
        if (iv.y1 > last.y1) { last.y1 = iv.y1; last.endName = iv.name; }
      } else {
        runs.push({ y0: iv.y0, y1: iv.y1, startName: iv.name, endName: iv.name });
      }
    }

    // The empty bands between runs (and against the panel edges). Raw viewport px kept
    // for the overlay; `h` is zoom-normalized like every reported number.
    const bands = [];
    const addBand = (y0, y1, between, edge) => {
      const h = (y1 - y0) / z;
      if (h >= 2) bands.push({ y0raw: y0, y1raw: y1, h: round1(h), pct: round1(h / H * 100), between, edge });
    };
    if (runs.length) {
      addBand(top, runs[0].y0, 'panel-top→' + runs[0].startName, 'top');
      for (let i = 1; i < runs.length; i++) {
        addBand(runs[i - 1].y1, runs[i].y0, runs[i - 1].endName + '→' + runs[i].startName, null);
      }
      addBand(runs[runs.length - 1].y1, bottom, runs[runs.length - 1].endName + '→panel-bottom', 'bottom');
    }

    const topGap = bands.find(b => b.edge === 'top');
    const botGap = bands.find(b => b.edge === 'bottom');
    const inner = bands.filter(b => !b.edge);
    // Pooling looks at inner bands only; edge bands are judged by their asymmetry instead.
    const sorted = [...inner].sort((a, b) => b.pct - a.pct);
    const maxBand = sorted[0] || null;
    const poolExcessPct = maxBand ? round1(maxBand.pct - (sorted[1] ? sorted[1].pct : 0)) : 0;

    // Rhythm looks only at the LARGE inner gaps (≥1.5% of panel height): the eye reads the
    // consistency of section spacing, not a 3px label gap against a 40px section gap.
    let innerGapCV = null;
    const rhythm = inner.filter(b => b.pct >= 1.5);
    if (rhythm.length >= 2) {
      const mean = rhythm.reduce((s, b) => s + b.h, 0) / rhythm.length;
      const sd = Math.sqrt(rhythm.reduce((s, b) => s + (b.h - mean) ** 2, 0) / rhythm.length);
      innerGapCV = mean > 0 ? round1(sd / mean * 100) : 0;
    }
    const fillPct = runs.length
      ? round1(((runs[runs.length - 1].y1 - runs[0].y0) / z) / H * 100) : 0;

    const metrics = {
      panelH: round1(H),
      maxBandPct: maxBand ? maxBand.pct : 0,
      poolExcessPct,
      maxBandAt: maxBand ? maxBand.between : '',
      topGapPct: topGap ? topGap.pct : 0,
      bottomGapPct: botGap ? botGap.pct : 0,
      edgeAsymPct: round1(Math.abs((topGap ? topGap.pct : 0) - (botGap ? botGap.pct : 0))),
      innerGapCV,
      fillPct,
    };

    const pts = {
      pooling:   round1(clamp((metrics.poolExcessPct - SCORE.poolStartPct) * SCORE.poolWeight, 0, SCORE.poolCap)),
      offcenter: round1(clamp((metrics.edgeAsymPct - SCORE.asymStartPct) * SCORE.asymWeight, 0, SCORE.asymCap)),
      uneven:    innerGapCV === null ? 0
               : round1(clamp((innerGapCV - SCORE.cvStart) * SCORE.cvWeight, 0, SCORE.cvCap)),
      underfill: round1(clamp((SCORE.fillFloorPct - metrics.fillPct) * SCORE.fillWeight, 0, SCORE.fillCap)),
    };
    const score = Math.min(100, Math.round(pts.pooling + pts.offcenter + pts.uneven + pts.underfill));
    const flags = Object.keys(pts).filter(k => pts[k] > 0);

    // Role positions for the cross-screen stay-put comparison (balance-audit.js does the
    // comparing; here we only record where each role sits on THIS screen).
    const roles = {};
    if (root.BALANCE_ROLES) {
      for (const [key, role] of Object.entries(BALANCE_ROLES)) {
        const el = [...panel.querySelectorAll(role.sel)]
          .find(e => !e.closest('.balance-overlay') && e.getBoundingClientRect().height > 0);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        roles[key] = {
          top:    round1((r.top - pr.top) / z),
          bottom: round1((pr.bottom - r.bottom) / z),
          center: round1(((r.top + r.bottom) / 2 - pr.top) / z),
        };
      }
    }

    return { metrics, pts, score, flagged: score >= SCORE.flagAt, flags, bands, roles };
  }

  // Draw the bands + a scorecard over the live page so calibration can see exactly what the
  // metric saw. Fixed-position and pointer-events:none, so it never affects the layout it reports.
  function drawOverlay(report) {
    document.querySelectorAll('.balance-overlay').forEach(e => e.remove());
    if (!report) return;
    const ov = document.createElement('div');
    ov.className = 'balance-overlay';
    ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;font:11px monospace;';
    for (const b of report.bands) {
      if (b.pct < 3) continue; // tiny designed gaps would just be noise
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;right:0;background:rgba(255,0,90,.14);' +
        'border-top:1px dashed rgba(255,0,90,.6);border-bottom:1px dashed rgba(255,0,90,.6);' +
        `top:${b.y0raw}px;height:${b.y1raw - b.y0raw}px;`;
      const t = document.createElement('div');
      t.textContent = `${b.h}px · ${b.pct}% · ${b.between}`;
      t.style.cssText = 'color:#ff5c8a;background:#000c;display:inline-block;padding:0 4px;';
      d.appendChild(t);
      ov.appendChild(d);
    }
    const card = document.createElement('div');
    const m = report.metrics, p = report.pts;
    card.style.cssText = 'position:fixed;top:4px;right:4px;background:#000d;color:#ddd;' +
      'padding:6px 8px;border:1px solid #444;line-height:1.5;text-align:left;';
    card.innerHTML =
      `<b style="color:${report.score >= SCORE.flagAt ? '#ff5c8a' : '#7c6'}">score ${report.score}</b>` +
      ` ${report.flags.join(' ') || 'ok'}<br>` +
      `maxBand ${m.maxBandPct}% · excess ${m.poolExcessPct}% (${m.maxBandAt})<br>` +
      `edges ${m.topGapPct}%/${m.bottomGapPct}% asym ${m.edgeAsymPct}%<br>` +
      `gapCV ${m.innerGapCV === null ? 'n/a' : m.innerGapCV + '%'} · fill ${m.fillPct}%<br>` +
      `pts p${p.pooling} o${p.offcenter} u${p.uneven} f${p.underfill}`;
    ov.appendChild(card);
    document.body.appendChild(ov);
  }

  // Compute (and optionally overlay) for the current Screen; publishes window.__BALANCE__
  // so the lab shell and the headless runner can read the result.
  function run(opts) {
    opts = opts || {};
    const report = measure();
    if (report) {
      report.fixture = opts.fixture || null;
      report.size = window.innerWidth + 'x' + window.innerHeight;
    }
    if (opts.overlay) drawOverlay(report);
    root.__BALANCE__ = report;
    return report;
  }

  root.BalanceMetrics = { SCORE, measure, drawOverlay, run };
})(typeof window !== 'undefined' ? window : this);
