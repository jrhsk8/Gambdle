// Headless test runner — opens test.html in Chromium and prints results.
// Usage: node _run_tests.js
// First run: npm install (installs playwright)

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page    = await browser.newPage();

  await page.goto('file:///' + __dirname.replace(/\\/g, '/') + '/test.html');
  await page.waitForFunction(() => {
    const s = document.getElementById('summary');
    return s && s.className && s.className !== '';
  }, { timeout: 15000 });

  const summary  = await page.textContent('#summary');
  const sections = await page.evaluate(() =>
    [...document.querySelectorAll('.section-block')].map(el => ({
      name:  el.querySelector('.section-name')?.textContent || '?',
      count: el.querySelector('.section-count')?.textContent || '',
      fails: [...el.querySelectorAll('.test-fail')].map(f => ({
        group: f.closest('.group-row')?.querySelector('.group-name')?.textContent || '',
        msg:   f.querySelector('.fail-msg')?.textContent  || '',
        err:   f.querySelector('.fail-err')?.textContent  || '',
      })),
    }))
  );

  console.log('SUMMARY:', summary.trim(), '\n');
  for (const sec of sections) {
    console.log(`[${sec.name}] ${sec.count}`);
    for (const f of sec.fails) {
      console.log(`  FAIL [${f.group}] ${f.msg}`);
      if (f.err) console.log(`       ${f.err}`);
    }
  }

  await browser.close();
  process.exit(sections.some(s => s.fails.length) ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
