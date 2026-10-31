/* eslint-env node */
/**
 * Sets the app name shown in window titles and the installer product name.
 *
 *   node build-scripts/set-app-name.js "My Name"
 *
 * Safe to run again with a different name. The current name is remembered in
 * build-scripts/.app-name (defaults to "VRCX"). Internal identifiers, the data
 * folder and the executable name are left alone on purpose, so your existing
 * data keeps working.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nameFile = path.join(__dirname, '.app-name');
const next = (process.argv[2] || '').trim();

if (!next || next.length > 30 || /['"<>&\\`$]/.test(next)) {
    console.error('Give a name of 1-30 characters without quotes, <, >, &, \\, ` or $.');
    process.exit(1);
}

const prev = fs.existsSync(nameFile) ? fs.readFileSync(nameFile, 'utf8').trim() : 'VRCX';

const edits = [
    ['electron-builder.config.js', `productName: '${prev}'`, `productName: '${next}'`],
    ['src/index.html', `<title>${prev}</title>`, `<title>${next}</title>`],
    ['src/components/MacOSTitleBar.vue', `<span class="app-title">${prev}</span>`, `<span class="app-title">${next}</span>`],
    ['src-electron/main.js', `title: '${prev}',`, `title: '${next}',`]
];

let changed = 0;
for (const [file, from, to] of edits) {
    const full = path.join(root, file);
    const text = fs.readFileSync(full, 'utf8');
    if (!text.includes(from)) {
        console.warn(`skipped ${file}: did not find "${from}"`);
        continue;
    }
    fs.writeFileSync(full, text.split(from).join(to));
    changed++;
    console.log(`updated ${file}`);
}

fs.writeFileSync(nameFile, next + '\n');
console.log(`App name is now "${next}" (${changed}/${edits.length} files updated).`);
