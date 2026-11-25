import { describe, expect, it } from 'vitest';

import { bundleFor, readBundleHeader } from '../avatarBundle';

function header(unity) {
    const enc = (s) => [...s].map((c) => c.charCodeAt(0)).concat(0);
    return new Uint8Array([...enc('UnityFS'), 0, 0, 0, 8, ...enc('5.x.x'), ...enc(unity)]);
}

describe('avatar bundle', () => {
    it('reads the unity version from a UnityFS header', () => {
        expect(readBundleHeader(header('2022.3.22f1'))).toMatchObject({ format: 8, unityVersion: '2022.3.22f1' });
    });
    it('rejects other files', () => {
        expect(readBundleHeader(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).toBeNull();
        expect(readBundleHeader(header('nonsense'))).toBeNull();
    });
    it('finds the newest file of a platform', () => {
        const avatar = {
            unityPackages: [
                { platform: 'android', assetUrl: 'https://x/file/file_aaaaaaaa-1/1/file', unityVersion: '2022.3.6f1' },
                { platform: 'standalonewindows', assetUrl: 'https://x/file/file_bbbbbbbb-2/3/file', unityVersion: '2022.3.22f1' }
            ]
        };
        expect(bundleFor(avatar, 'standalonewindows')).toEqual({ fileId: 'file_bbbbbbbb-2', unityVersion: '2022.3.22f1' });
        expect(bundleFor(avatar, 'ios')).toBeNull();
    });
});
