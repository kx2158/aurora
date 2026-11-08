// Takes screenshots of the preview harness. Usage: node shoot.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const routes = ['home', 'mic', 'insights', 'automations', 'feed', 'friend-list', 'charts-mutual', 'settings'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300));
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`.slice(0, 300)));
await page.goto(`${base}/preview.html`, { waitUntil: 'load' });
try {
    await page.waitForFunction(() => window.__previewReady === true, null, { timeout: 60000 });
} catch {
    logs.push('preview never became ready');
}
for (const r of routes) {
    await page.evaluate((name) => window.location.hash = `#/${name === 'settings' ? 'settings' : name.replace('friend-list', 'social/friend-list').replace('charts-mutual', 'charts/mutual')}`, r);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${r}.jpg`, type: 'jpeg', quality: 82 });
}
// collapsed sidebar and light theme on Home
await page.evaluate(() => (window.location.hash = '#/home'));
await page.evaluate(() => window.$pinia.appearanceSettings.setThemeMode('xray'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/home-light.jpg`, type: 'jpeg', quality: 82 });
fs.writeFileSync(`${out}/console.txt`, logs.join('\n'));
await browser.close();
