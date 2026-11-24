import { describe, expect, it } from 'vitest';

import { missingIds, withCachedAge } from '../ageCache';

describe('age cache', () => {
    it('only asks about friends it has never looked up', () => {
        expect(missingIds(['a', 'b', 'c'], { a: '18+', c: 'none' })).toEqual(['b']);
    });
    it('fills a blank row from the cache and leaves known rows alone', () => {
        expect(withCachedAge({ id: 'a', age: 'unknown' }, { a: '18+' }).age).toBe('18plus');
        expect(withCachedAge({ id: 'a', age: 'hidden' }, { a: '18+' }).age).toBe('hidden');
        expect(withCachedAge({ id: 'b', age: 'unknown' }, { b: 'none' }).age).toBe('unknown');
    });
});
