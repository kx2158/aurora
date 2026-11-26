import { describe, expect, it } from 'vitest';

import { buildStarterPrompt, CONNECTORS, createApi, EXAMPLE_MODULE, MODULE_API_VERSION, runModuleSource, validateManifest } from '../moduleGuide';

describe('module starter prompt', () => {
    it('lists every connector and the example, and ends where the idea goes', () => {
        const prompt = buildStarterPrompt();
        for (const c of CONNECTORS) {
            expect(prompt).toContain(c.sig);
        }
        expect(prompt).toContain(EXAMPLE_MODULE);
        expect(prompt).toContain(`API version ${MODULE_API_VERSION}`);
        expect(prompt.trimEnd().endsWith('MY IDEA:')).toBe(true);
        expect(prompt).not.toContain('—');
    });
});

describe('module manifest', () => {
    it('accepts a good one and fills defaults', () => {
        const m = validateManifest({ id: 'my-mod', name: 'My mod', options: [{ key: 'a', type: 'bool' }] });
        expect(m).toMatchObject({ id: 'my-mod', version: '1.0.0' });
        expect(m.options[0]).toMatchObject({ key: 'a', type: 'bool', default: false });
    });
    it('rejects bad ids and option keys', () => {
        expect(() => validateManifest({ id: 'Bad Id' })).toThrow();
        expect(() => validateManifest({ id: 'ok', options: [{ key: '1x' }] })).toThrow();
        expect(() => validateManifest(null)).toThrow();
    });
});

describe('the example module', () => {
    it('runs against the connectors and registers a line and a panel', () => {
        const calls = { lines: [], panels: [], listeners: [] };
        const host = {
            getOption: () => 'In',
            addLine: (m, line) => calls.lines.push(line),
            on: (id, event) => calls.listeners.push(event),
            storageGet: (id, k, f) => f,
            storageSet() {},
            addPanel: (id, p) => calls.panels.push(p),
            notify() {}
        };
        let manifest = null;
        runModuleSource(EXAMPLE_MODULE, createApi(host, (m) => (manifest = m)));
        expect(manifest.id).toBe('world-hello');
        expect(calls.lines).toHaveLength(1);
        expect(calls.lines[0].id).toBe('mod-world-hello-main');
        expect(calls.panels).toHaveLength(1);
    });
    it('fails clearly when define is missing', () => {
        const api = createApi({}, () => {});
        expect(() => runModuleSource('aura.chatbox.line({ name: "x", render() { return ""; } });', api)).toThrow('aura.define');
    });
});
