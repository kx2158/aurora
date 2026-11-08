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
await page.evaluate(() => document.querySelector('.a-page')?.scrollTo(0, 99999));
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
// ---- the desktop overlay page, fed with a fake state ----
const desk = await browser.newPage({ viewport: { width: 400, height: 620 } });
desk.on('pageerror', (e) => logs.push(`[desk pageerror] ${e.message}`.slice(0, 300)));
await desk.goto(`${base}/desk.html`, { waitUntil: 'load' });
await desk.waitForTimeout(1500);
const deskState = {
    theme: 'xraydark',
    dark: true,
    axh: '0',
    axk: '0',
    hotkey: 'Ctrl+Shift+A',
    chatbox: { enabled: true, preview: '21:14 | The Great Pug | 7 friends online' },
    alarms: [
        { id: 1, time: '21:40', label: 'Timer 25 min', daily: false, enabled: true },
        { id: 2, time: '23:30', label: 'Bed', daily: true, enabled: true }
    ],
    here: {
        place: 'The Great Pug',
        alert: { id: 'usr_x1', name: 'NightOwl_42', text: 'Watch: spammed the mirror last week / Account 6 days old', at: Date.now() },
        people: [
            { id: 'usr_x1', name: 'NightOwl_42', since: Date.now() - 40000, trust: 'New User', friend: false, watched: true, flags: [{ key: 'watch', label: 'Watch: spammed the mirror last week' }, { key: 'new', label: 'Account 6 days old' }] },
            { id: 'usr_x2', name: 'Mirai', since: Date.now() - 9 * 60000, trust: 'Trusted User', friend: true, watched: false, flags: [] },
            { id: 'usr_x3', name: 'pixelmoth', since: Date.now() - 24 * 60000, trust: 'Known User', friend: false, watched: false, flags: [{ key: 'blocked', label: 'You blocked them' }] },
            { id: 'usr_x4', name: 'Kael', since: Date.now() - 75 * 60000, trust: 'User', friend: true, watched: false, flags: [] }
        ]
    },
    mm: { running: true, micMuted: false, app: 'Spotify', apps: ['Spotify', 'Firefox'], micVol: 1.2, musicVol: 0.6, micNoise: 0.5, micBass: 0.2, musicBass: 0.35, micPeak: 0.45, outPeak: 0.62, error: '' }
};
for (const tab of ['Mic', 'Timers', 'Chatbox', 'Here']) {
    await desk.evaluate((st) => window.deskState(JSON.stringify(st)), deskState);
    await desk.getByRole('button', { name: tab }).first().click().catch(() => {});
    await desk.waitForTimeout(500);
    await desk.screenshot({ path: `${out}/desk-${tab.toLowerCase()}.jpg`, type: 'jpeg', quality: 85 });
}

// ---- the VR panels (wrist and SteamVR dashboard) ----
const vr = await browser.newPage({ viewport: { width: 2048, height: 1536 } });
vr.on('pageerror', (e) => logs.push(`[vr pageerror] ${e.message}`.slice(0, 300)));
await vr.addInitScript(() => {
    window.WINDOWS = false;
    window.LINUX = false;
    window.interopApi = { callDotNetMethod: async () => null };
});
await vr.goto(`${base}/vr.html`, { waitUntil: 'load' });
await vr.waitForTimeout(2500);
await vr
    .evaluate(() =>
        window.$vr?.neonState?.(
            JSON.stringify({
                accent: '#b4b4b4',
                chatbox: true,
                mm: true,
                mmMuted: false,
                mmApp: 'Spotify',
                mmVol: 60,
                song: 'Night Drive',
                artist: 'xoliexen',
                playing: true,
                sounds: true,
                afk: false,
                music: true,
                preview: '21:14 | The Great Pug | 7 friends online',
                nextAlarm: '21:40'
            })
        )
    )
    .catch((e) => logs.push('[vr state] ' + e.message));
await vr.waitForTimeout(800);
await vr.screenshot({ path: `${out}/vr-dash.jpg`, type: 'jpeg', quality: 80, clip: { x: 1024, y: 0, width: 1024, height: 1024 } });
await vr.screenshot({ path: `${out}/vr-wrist.jpg`, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 512, height: 512 } });
// the opening animation, frozen at a few moments
try {
    await vr.evaluate(() => window.$vr.wristShown());
    await vr.waitForTimeout(100);
    for (const t of [120, 380, 700, 1100]) {
        await vr.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), t);
        await vr.waitForTimeout(150);
        await vr.screenshot({ path: `${out}/vr-open-${t}.jpg`, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 512, height: 512 } });
    }
    await vr.evaluate(() => document.getAnimations().forEach((a) => a.play()));
    await vr.waitForTimeout(2300);
} catch (e) {
    logs.push('[vr open] ' + e.message);
}
await vr.screenshot({ path: `${out}/vr-wrist-3d.jpg`, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 512, height: 512 } });
// a made-up night world behind the watch, to show the see-through glass and the glitches
await vr.addStyleTag({
    content: `html, body, #x-app { background:
        radial-gradient(circle at 18% 30%, rgba(255, 120, 200, 0.85), transparent 14%),
        radial-gradient(circle at 70% 18%, rgba(90, 170, 255, 0.9), transparent 16%),
        radial-gradient(circle at 45% 75%, rgba(255, 190, 90, 0.75), transparent 18%),
        radial-gradient(circle at 85% 65%, rgba(140, 255, 210, 0.6), transparent 12%),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 64px),
        linear-gradient(180deg, #1a1630 0%, #2b2046 45%, #0e0c18 100%) !important; }`
});
await vr.waitForTimeout(400);
await vr.screenshot({ path: `${out}/vr-glass.jpg`, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 512, height: 512 } });
try {
    await vr.evaluate(() => window.$vr.wristGlitch(1.4));
    await vr.waitForTimeout(80);
    for (const t of [40, 140, 240]) {
        await vr.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), t);
        await vr.waitForTimeout(120);
        await vr.screenshot({ path: `${out}/vr-glitch-${t}.jpg`, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 512, height: 512 } });
    }
    await vr.evaluate(() => document.getAnimations().forEach((a) => a.play()));
} catch (e) {
    logs.push('[vr glitch] ' + e.message);
}
// someone flagged joined
await vr
    .evaluate(() =>
        window.$vr?.neonState?.(
            JSON.stringify({ accent: '#b4b4b4', chatbox: true, mm: true, mmVol: 60, sounds: false, watchAlert: { id: 'usr_x1', name: 'NightOwl_42', text: 'Account 6 days old', at: 1 } })
        )
    )
    .catch(() => {});
await vr.waitForTimeout(500);
await vr.screenshot({ path: `${out}/vr-wrist-alert.jpg`, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 512, height: 512 } });

fs.writeFileSync(`${out}/console.txt`, logs.join('\n'));
await browser.close();
