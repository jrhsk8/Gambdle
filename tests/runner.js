let _pass = 0, _fail = 0;
let _currentGroup = null;
const _groups = [];
const _measurements = [];

function measure(label, value) {
  _measurements.push({ label, value });
}

function section(name) {
  _groups.push({ _section: true, name });
}

function describe(name, fn) {
  _currentGroup = { name, tests: [] };
  _groups.push(_currentGroup);
  fn();
  _currentGroup = null;
}

function it(msg, fn) {
  try {
    fn();
    _pass++;
    _currentGroup.tests.push({ ok: true, msg });
  } catch (e) {
    _fail++;
    _currentGroup.tests.push({ ok: false, msg, err: e.message });
    console.error(`✗ [${_currentGroup.name}] ${msg}\n  ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) {
    const detail = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
    throw new Error(msg ? `${msg}: ${detail}` : detail);
  }
}

function assertDeepEqual(a, b, msg) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) {
    const detail = `expected ${bs}, got ${as}`;
    throw new Error(msg ? `${msg}: ${detail}` : detail);
  }
}

function _makeGroupRow(group) {
  const gPass = group.tests.filter(t => t.ok).length;
  const gFail = group.tests.filter(t => !t.ok).length;
  const allOk = gFail === 0;

  const row = document.createElement('div');
  row.className = 'group-row' + (allOk ? '' : ' group-row-fail');

  const line = document.createElement('div');
  line.className = 'group-line';
  const countStr = allOk
    ? `${gPass} ✓`
    : `${gFail} ✗${gPass ? ` · ${gPass} ✓` : ''}`;
  line.innerHTML =
    `<span class="group-name">${group.name}</span>` +
    `<span class="group-count ${allOk ? 'cnt-pass' : 'cnt-fail'}">${countStr}</span>`;
  row.appendChild(line);

  for (const t of group.tests.filter(t => !t.ok)) {
    const el = document.createElement('div');
    el.className = 'test-fail';
    el.innerHTML =
      `<span class="fail-x">✗</span>` +
      `<span class="fail-body"><span class="fail-msg">${t.msg}</span>` +
      (t.err ? `<span class="fail-err">${t.err}</span>` : '') +
      `</span>`;
    row.appendChild(el);
  }

  return row;
}

window.addEventListener('load', () => {
  const summary   = document.getElementById('summary');
  const container = document.getElementById('groups-grid');

  // Partition flat _groups list into named sections
  const sections = [];
  let cur = { name: null, groups: [] };
  sections.push(cur);
  for (const g of _groups) {
    if (g._section) { cur = { name: g.name, groups: [] }; sections.push(cur); }
    else cur.groups.push(g);
  }

  for (const sec of sections) {
    if (!sec.groups.length) continue;

    const sPass = sec.groups.reduce((n, g) => n + g.tests.filter(t => t.ok).length, 0);
    const sFail = sec.groups.reduce((n, g) => n + g.tests.filter(t => !t.ok).length, 0);
    const sAllOk = sFail === 0;

    if (sec.name) {
      const block = document.createElement('div');
      block.className = 'section-block' + (sAllOk ? ' collapsed' : ' section-has-fail');

      const hdr = document.createElement('div');
      hdr.className = 'section-hdr';
      const countStr = sAllOk
        ? `${sPass} ✓`
        : `${sFail} ✗${sPass ? ` · ${sPass} ✓` : ''}`;
      hdr.innerHTML =
        `<span><span class="section-arrow">${sAllOk ? '▶' : '▼'}</span><span class="section-name">${sec.name}</span></span>` +
        `<span class="section-count ${sAllOk ? 'cnt-pass' : 'cnt-fail'}">${countStr}</span>`;
      hdr.addEventListener('click', () => {
        const open = !block.classList.contains('collapsed');
        block.classList.toggle('collapsed', open);
        hdr.querySelector('.section-arrow').textContent = open ? '▶' : '▼';
      });
      block.appendChild(hdr);

      const body = document.createElement('div');
      body.className = 'section-body';
      for (const g of sec.groups) body.appendChild(_makeGroupRow(g));
      block.appendChild(body);
      container.appendChild(block);
    } else {
      for (const g of sec.groups) container.appendChild(_makeGroupRow(g));
    }
  }

  summary.textContent = _fail === 0
    ? `✅ All ${_pass} tests passed`
    : `❌ ${_fail} failed · ${_pass} passed`;
  summary.className = _fail === 0 ? 'all-pass' : 'has-fail';
  console.log(_fail === 0 ? `✅ All ${_pass} passed` : `❌ ${_fail} failed, ${_pass} passed`);

  // Write measurements to a hidden DOM element so the CLI runner can query them.
  if (_measurements.length) {
    const mc = document.createElement('div');
    mc.id = 'measure-data';
    mc.style.display = 'none';
    for (const m of _measurements) {
      const d = document.createElement('div');
      d.dataset.label = m.label;
      d.dataset.value = String(m.value);
      mc.appendChild(d);
    }
    document.body.appendChild(mc);
  }
});
