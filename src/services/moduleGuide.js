/**
 * Aura modules: the connectors that are fixed (API version 1), the module example, and the starter prompt people give
 * to an AI so the module it writes plugs into Aura. Pure (no Vue, no app imports), so it can be tested on its own.
 */
export const MODULE_API_VERSION = 1;

/** The fixed connectors. Anything not listed here is not part of the contract and may change. */
export const CONNECTORS = [
    {
        name: 'aura.define',
        sig: 'aura.define({ id, name, version, description, options? })',
        desc: 'Required, call it once first. id is lowercase letters, numbers and dashes (2 to 32). options is a list of settings the user can change: { key, label, type: "text" | "bool" | "number", default }.'
    },
    {
        name: 'aura.options.get',
        sig: 'aura.options.get(key)',
        desc: 'The current value of one of your options (the user edits them on the Modules page).'
    },
    {
        name: 'aura.chatbox.line',
        sig: 'aura.chatbox.line({ id?, name, desc?, slot?, options?, render(ctx) })',
        desc: 'Adds a line to the VRChat chatbox. render returns a string (empty string = show nothing). slot is "top", "bottom" or "rotate". ctx.options holds this line\'s own options. It shows up in the Chatbox page as an integration the user can switch on.'
    },
    {
        name: 'aura.data',
        sig: 'aura.data.world() | players() | friendsOnline() | song() | artist() | musicPlaying() | idleSeconds() | app() | vrchatRunning() | now()',
        desc: 'Read only live values. world() is the world name (empty when offline), now() is a Date. Never modify what they return.'
    },
    {
        name: 'aura.on',
        sig: 'aura.on(event, callback)',
        desc: 'Events: "tick" (every second), "world" (world changed, gets the name), "song" (song changed, gets { song, artist }), "friends" (online friend count changed, gets the number). Returns nothing; listeners are removed when the module is turned off.'
    },
    {
        name: 'aura.storage',
        sig: 'aura.storage.get(key, fallback) | aura.storage.set(key, value)',
        desc: 'Saves small JSON values for this module only. Keep it under a few KB.'
    },
    {
        name: 'aura.panel',
        sig: 'aura.panel({ title, render(el) })',
        desc: 'Adds a card on the Modules page. render gets an empty div (el) and fills it with plain DOM (document.createElement). Do not touch anything outside el.'
    },
    {
        name: 'aura.notify',
        sig: 'aura.notify(text)',
        desc: 'Shows a small toast in the app.'
    },
    {
        name: 'aura.log',
        sig: 'aura.log(...args)',
        desc: 'Writes to the console, tagged with the module id.'
    }
];

/** A complete small module, used as the example in the prompt and in the tests. */
export const EXAMPLE_MODULE = `aura.define({
    id: 'world-hello',
    name: 'World hello',
    version: '1.0.0',
    description: 'Adds a chatbox line that says where you are.',
    options: [
        { key: 'prefix', label: 'Text before the world name', type: 'text', default: 'In' }
    ]
});

aura.chatbox.line({
    name: 'World hello',
    slot: 'top',
    render(ctx) {
        const world = aura.data.world();
        return world ? ctx.options.prefix + ' ' + world : '';
    }
});

aura.panel({
    title: 'World hello',
    render(el) {
        el.textContent = 'You are in: ' + (aura.data.world() || 'nowhere');
        aura.on('world', (name) => { el.textContent = 'You are in: ' + (name || 'nowhere'); });
    }
});
`;

/** The prompt people paste into an AI, followed by their own idea. */
export function buildStarterPrompt() {
    const connectors = CONNECTORS.map((c) => `- ${c.sig}\n  ${c.desc}`).join('\n');
    return `You are writing a module for Aura, a VRChat companion app. A module is ONE plain JavaScript file that the user installs on the Modules page. Aura module API version ${MODULE_API_VERSION}.

HOW IT RUNS
- Aura runs your file as a function body with one variable, \`aura\`. There is no import, no export, no require, no build step and no framework.
- Write plain modern JavaScript. Use only \`aura\` and normal browser globals (Date, Math, JSON, document for your own panel element).
- Do not use fetch or any network call unless my idea needs it, and then say so in a comment at the top.
- Never touch anything outside your own panel element. Never read or change Aura itself.
- The ONLY connectors you may use are the ones below. Do not invent any other aura.* function.

CONNECTORS (these are fixed)
${connectors}

RULES
1. Call aura.define first, exactly once.
2. Keep render functions fast and free of errors: return an empty string instead of throwing.
3. Chatbox text is limited, so keep each line short (under 40 characters if you can).
4. If my idea needs a connector that does not exist, tell me which one is missing and do the closest thing that works with the connectors above.
5. Reply with ONE code block containing the whole file, then at most two sentences telling me what to expect. No other text.

EXAMPLE (a complete module)
\`\`\`js
${EXAMPLE_MODULE}\`\`\`

MY IDEA:
`;
}

/** Checks the object a module gave to aura.define. Returns the cleaned manifest or throws an Error with a plain message. */
export function validateManifest(def) {
    if (!def || typeof def !== 'object') {
        throw new Error('aura.define needs an object.');
    }
    const id = String(def.id || '');
    if (!/^[a-z0-9-]{2,32}$/.test(id)) {
        throw new Error('The module id must be 2 to 32 lowercase letters, numbers or dashes.');
    }
    const options = [];
    for (const o of Array.isArray(def.options) ? def.options.slice(0, 20) : []) {
        const key = String(o?.key || '');
        const type = ['text', 'bool', 'number'].includes(o?.type) ? o.type : 'text';
        if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key)) {
            throw new Error(`Bad option key: ${key || '(empty)'}.`);
        }
        const fallback = type === 'bool' ? false : type === 'number' ? 0 : '';
        options.push({ key, type, label: String(o.label || key).slice(0, 80), default: o.default ?? fallback });
    }
    return {
        id,
        name: String(def.name || id).slice(0, 60),
        version: String(def.version || '1.0.0').slice(0, 20),
        description: String(def.description || '').slice(0, 200),
        options
    };
}

/** Runs module source against an api object. Errors are thrown to the caller. */
export function runModuleSource(source, api) {
    // eslint-disable-next-line no-new-func
    new Function('aura', `"use strict";\n${source}`)(api);
}

/** Builds the `aura` object one module sees. `host` holds the side effects, so tests can fake them. */
export function createApi(host, onDefine) {
    let defined = null;
    const need = () => {
        if (!defined) throw new Error('Call aura.define first.');
        return defined;
    };
    return {
        version: 1,
        define(def) {
            if (defined) throw new Error('aura.define was called twice.');
            defined = validateManifest(def);
            onDefine(defined);
        },
        options: { get: (key) => host.getOption(need().id, key) },
        chatbox: {
            line(def) {
                const m = need();
                const lineId = String(def?.id || 'main').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'main';
                const own = Array.isArray(def.options) ? validateManifest({ id: m.id, options: def.options }).options : [];
                host.addLine(m, {
                    id: `mod-${m.id}-${lineId}`,
                    name: String(def.name || m.name).slice(0, 60),
                    desc: String(def.desc || m.description || '').slice(0, 200),
                    slot: ['top', 'bottom', 'rotate'].includes(def.slot) ? def.slot : 'top',
                    options: own,
                    render: typeof def.render === 'function' ? def.render : () => ''
                });
            }
        },
        data: host.data,
        on: (event, cb) => host.on(need().id, event, cb),
        storage: {
            get: (key, fallback) => host.storageGet(need().id, key, fallback),
            set: (key, value) => host.storageSet(need().id, key, value)
        },
        panel(def) {
            host.addPanel(need().id, { title: String(def?.title || need().name).slice(0, 60), render: def?.render });
        },
        notify: (text) => host.notify(String(text).slice(0, 200)),
        log: (...args) => console.log(`[module ${defined?.id || '?'}]`, ...args)
    };
}
