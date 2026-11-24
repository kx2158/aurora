import { describe, expect, it } from 'vitest';

import { needsHiding, runSteps } from '../stealthSteps';

describe('stealth steps', () => {
    it('keeps going when one step fails and reports it', async () => {
        const ran = [];
        const failed = await runSteps(
            [
                { name: 'a', run: async () => ran.push('a') },
                {
                    name: 'b',
                    run: async () => {
                        throw new Error('nope');
                    }
                },
                { name: 'c', run: async () => ran.push('c') }
            ],
            0
        );
        expect(ran).toEqual(['a', 'c']);
        expect(failed).toEqual([{ step: 'b', error: 'nope' }]);
    });
    it('only touches what is not hidden yet', () => {
        const items = [{ v: 'hidden' }, { v: 'visible' }, { v: 'friends' }];
        expect(needsHiding(items, (i) => i.v === 'hidden')).toHaveLength(2);
    });
});
