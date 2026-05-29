// Headless test runner — opens tests/test.html and tests/layout-test.html in Chromium.
// Usage: npm test  (or:  node tests/run.js)
// First run: npm install (installs playwright)

const { chromium } = require('playwright');

const BASE = 'file:///' + __dirname.replace(/\\/g, '/') + '/';

// Opens a page, optionally at a specific viewport, waits for tests to finish,
// and returns the section data for reporting.
async function runPage(browser, file, viewport) {
  const page = await browser.newPage();
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(BASE + file);
  await page.waitForFunction(() => {
    const s = document.getElementById('summary');
    return s && s.className && s.className !== '';
  }, { timeout: 15000 });

  const data = await page.evaluate(() => ({
    summary: document.getElementById('summary').textContent.trim(),
    measurements: [...document.querySelectorAll('#measure-data > div')].map(el => ({
      label: el.dataset.label,
      value: parseInt(el.dataset.value),
    })),
    sections: [...document.querySelectorAll('.section-block')].map(el => ({
      name:  el.querySelector('.section-name')?.textContent  || '?',
      count: el.querySelector('.section-count')?.textContent || '',
      fails: [...el.querySelectorAll('.test-fail')].map(f => ({
        group: f.closest('.group-row')?.querySelector('.group-name')?.textContent || '',
        msg:   f.querySelector('.fail-msg')?.textContent || '',
        err:   f.querySelector('.fail-err')?.textContent || '',
      })),
    })),
  }));

  await page.close();
  return data;
}

function printSections(sections) {
  for (const sec of sections) {
    console.log(`[${sec.name}] ${sec.count}`);
    for (const f of sec.fails) {
      console.log(`  FAIL [${f.group}] ${f.msg}`);
      if (f.err) console.log(`       ${f.err}`);
    }
  }
}

function printMeasurements(measurements) {
  if (!measurements || !measurements.length) return;
  const sorted = [...measurements].sort((a, b) => a.value - b.value);
  console.log('  slack ↑ tightest first:');
  for (const m of sorted) {
    const flag = m.value < 40 ? '⚠ ' : m.value < 100 ? '· ' : '  ';
    console.log(`  ${flag}${m.label.padEnd(26)} ${m.value}px`);
  }
}

const anyFail = sections => sections.some(s => s.fails.length > 0);

(async () => {
  const browser = await chromium.launch();

  // Desktop sizes — covers the fluid clamp range and the narrow-but-tall case
  // (1024×1080) where the panel hits its width minimum but still needs to fit
  // the chip row and pay table without wrapping or overflow.
  const DESKTOP_SIZES = [
    { width: 1024, height: 1080 },
    { width: 1280, height:  800 },
    { width: 1440, height:  900 },
    { width: 1920, height: 1080 },
  ];

  const [main, mobile, ...desktops] = await Promise.all([
    runPage(browser, 'test.html',        null),
    runPage(browser, 'layout-test.html', { width: 375, height: 812 }),
    ...DESKTOP_SIZES.map(s => runPage(browser, 'layout-test.html', s)),
  ]);

  await browser.close();

  // Main suite
  console.log('SUMMARY:', main.summary, '\n');
  printSections(main.sections);

  // Layout — mobile
  console.log('\nLAYOUT [375×812]:', mobile.summary);
  printSections(mobile.sections);
  printMeasurements(mobile.measurements);

  // Layout — desktop (one block per size)
  for (let i = 0; i < desktops.length; i++) {
    const s = DESKTOP_SIZES[i], d = desktops[i];
    console.log(`\nLAYOUT [${s.width}×${s.height}]:`, d.summary);
    printSections(d.sections);
    printMeasurements(d.measurements);
  }

  const failed = anyFail(main.sections) || anyFail(mobile.sections)
    || desktops.some(d => anyFail(d.sections));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
