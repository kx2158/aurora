import { describe, expect, it } from 'vitest';

import { cleanFolders, sectionsFor } from '../groupFolders';

describe('group folders', () => {
    it('drops broken folders and duplicate members', () => {
        const out = cleanFolders([
            { id: 'a', name: 'Art', ids: ['g1', 'g2'] },
            { id: 'b', name: 'Games', ids: ['g2', 'g3'] },
            { name: '  ' },
            null
        ]);
        expect(out).toHaveLength(2);
        expect(out[1].ids).toEqual(['g3']);
    });
    it('puts folders first and the loose groups last', () => {
        const groups = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }];
        const folders = [{ id: 'a', name: 'Art', open: true, ids: ['g3', 'g1'] }];
        const s = sectionsFor(groups, folders);
        expect(s[0].groups.map((g) => g.id)).toEqual(['g1', 'g3']);
        expect(s[1].folder).toBe(null);
        expect(s[1].groups.map((g) => g.id)).toEqual(['g2']);
    });
});
