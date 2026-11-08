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
await page.waitForSelector('#login-form', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(300);
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
// Settings > Aurora (accent and colour wheel)
await page.evaluate(() => (window.location.hash = '#/settings'));
await page.waitForTimeout(1500);
await page.getByRole('tab', { name: 'Aurora' }).first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/settings-aurora.jpg`, type: 'jpeg', quality: 80 });
// the lower half of Automations
await page.evaluate(() => (window.location.hash = '#/automations'));
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('.a-page')?.scrollTo(0, 700));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/automations-2.jpg`, type: 'jpeg', quality: 80 });
// the lower half of Insights, and Mic while it is running
await page.evaluate(() => (window.location.hash = '#/insights'));
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('.a-page')?.scrollTo(0, 99999));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/insights-2.jpg`, type: 'jpeg', quality: 80 });
await page.evaluate(() => (window.location.hash = '#/mic'));
await page.waitForTimeout(1500);
await page.locator('button:has-text("Turn on")').first().click().catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/mic-on.jpg`, type: 'jpeg', quality: 80 });
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
try {
    const diag = await page.evaluate(() => ({
        appChildren: document.querySelector('#x-app')?.children.length ?? -1,
        canvases: document.querySelectorAll('canvas').length,
        webgl: !!document.createElement('canvas').getContext('webgl2'),
        text: document.body.innerText.slice(0, 200)
    }));
    logs.push('[network diag] ' + JSON.stringify(diag));
} catch (e) {
    logs.push('[network diag failed] ' + e.message);
}
await page.screenshot({ path: `${out}/network.jpg`, type: 'jpeg', quality: 80 });
fs.writeFileSync(`${out}/console.txt`, logs.join('\n'));
await browser.close();
