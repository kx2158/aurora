// Takes screenshots of the preview harness. Usage: node shoot.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const routes = {
    home: 'home',
    mic: 'mic',
    insights: 'insights',
    automations: 'automations',
    chatbox: 'chatbox',
    feed: 'feed',
    friends: 'friends-locations',
    'friend-list': 'social/friend-list',
    'game-log': 'game-log',
    tools: 'tools',
    settings: 'settings'
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300));
});
page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) logs.push(`[navigated] ${f.url()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`.slice(0, 300)));
await page.goto(`${base}/preview.html`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/login.jpg`, type: 'jpeg', quality: 80 });
try {
    await page.waitForFunction(() => window.__previewReady === true, null, { timeout: 60000 });
} catch {
    logs.push('preview never became ready');
}
await page.evaluate(() => window.$pinia?.appearanceSettings?.setNavCollapsed?.(false));
for (const [name, path] of Object.entries(routes)) {
    await page.keyboard.press('Escape');
    await page.evaluate((p) => (window.location.hash = `#/${p}`), path);
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 80 });
    logs.push(`--- after ${name}: ${page.url()}`);
    fs.writeFileSync(`${out}/console.txt`, logs.join('\n') + '\n');
}
// the sidebar folded down to icons
await page.evaluate(() => (window.location.hash = '#/insights'));
await page.evaluate(() => window.$pinia?.appearanceSettings?.setNavCollapsed?.(true));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/collapsed.jpg`, type: 'jpeg', quality: 80 });
await page.evaluate(() => window.$pinia?.appearanceSettings?.setNavCollapsed?.(false));
// collapsed sidebar and light theme on Home
await page.evaluate(() => (window.location.hash = '#/home'));
await page.evaluate(() => window.$pinia?.appearanceSettings?.setThemeMode('xray'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/home-light.jpg`, type: 'jpeg', quality: 82 });
// the friend network last: it needs WebGL, which is shaky in CI
await page.evaluate(() => window.$pinia?.appearanceSettings?.setThemeMode('xraydark'));
await page.evaluate(() => (window.location.hash = '#/charts/mutual'));
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/network.jpg`, type: 'jpeg', quality: 80 });
fs.writeFileSync(`${out}/console.txt`, logs.join('\n'));
await browser.close();
