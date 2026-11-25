/**
 * Replace the file of an avatar you own with a .vrca you built yourself.
 * It reuses the same signed upload VRChat's own tools use for files: new version of the avatar's existing file, upload the
 * file and its rsync signature, then point the avatar at the new version.
 */
import { extractFileId } from '../shared/utils';
import { request } from './request';
import { useUserStore } from '../stores';

export const PLATFORMS = { standalonewindows: 'PC', android: 'Quest / Android' };
export const MAX_VRCA_BYTES = 150 * 1024 * 1024;

/** Reads the Unity version out of an asset bundle header ("UnityFS"). Returns null when it is not a Unity bundle. */
export function readBundleHeader(bytes) {
    const magic = 'UnityFS';
    for (let i = 0; i < magic.length; i++) {
        if (bytes[i] !== magic.charCodeAt(i)) {
            return null;
        }
    }
    if (bytes[7] !== 0) {
        return null;
    }
    let i = 12; // after the magic (8 bytes) and the 4 byte format version
    const readString = () => {
        let s = '';
        while (i < bytes.length && bytes[i] !== 0 && s.length < 64) {
            s += String.fromCharCode(bytes[i++]);
        }
        i++;
        return s;
    };
    const format = (bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11];
    const player = readString();
    const unityVersion = readString();
    return /^\d{4}\.\d+\.\d+[a-z]\d+$/.test(unityVersion) ? { format, player, unityVersion } : null;
}

/** Newest file id and version for a platform of an avatar, taken from its unityPackages. */
export function bundleFor(avatar, platform) {
    const pkgs = (avatar?.unityPackages || []).filter((p) => p.platform === platform && p.assetUrl);
    const last = pkgs[pkgs.length - 1];
    return last ? { fileId: extractFileId(last.assetUrl), unityVersion: last.unityVersion } : null;
}

function toBase64(buffer) {
    let s = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
}

async function put(url, data, mime, md5) {
    const res = await webApiService.execute({ url, uploadFilePUT: true, fileData: data, fileMIME: mime, fileMD5: md5 });
    if (res.status !== 200) {
        throw new Error(`upload failed (${res.status})`);
    }
}

/**
 * @param {string} avatarId
 * @param {string} platform standalonewindows or android
 * @param {File} file the .vrca
 * @param {(msg:string)=>void} say progress text
 */
export async function replaceAvatarBundle(avatarId, platform, file, say = () => {}) {
    if (!/^avtr_[0-9a-f-]{36}$/.test(avatarId)) {
        throw new Error('That is not an avatar id (avtr_...).');
    }
    if (file.size > MAX_VRCA_BYTES) {
        throw new Error('That file is over 150 MB.');
    }
    const buffer = await file.arrayBuffer();
    const header = readBundleHeader(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 256)));
    if (!header) {
        throw new Error('That is not a Unity asset bundle (.vrca).');
    }
    say('Checking the avatar');
    const avatar = await request(`avatars/${avatarId}`, { method: 'GET' });
    if (avatar.authorId !== useUserStore().currentUser.id) {
        throw new Error('That avatar is not yours.');
    }
    const current = bundleFor(avatar, platform);
    if (!current?.fileId) {
        throw new Error(`This avatar has no ${PLATFORMS[platform] || platform} file to replace.`);
    }

    say('Preparing the upload');
    const base64 = toBase64(buffer);
    const fileMd5 = await AppApi.MD5File(base64);
    const sig = await AppApi.SignFile(base64);
    const sigMd5 = await AppApi.MD5File(sig);
    const sigSize = parseInt(await AppApi.FileLength(sig), 10);

    const created = await request(`file/${current.fileId}`, {
        method: 'POST',
        params: { fileMd5, fileSizeInBytes: file.size, signatureMd5: sigMd5, signatureSizeInBytes: sigSize }
    });
    const fileId = created.id;
    const version = created.versions[created.versions.length - 1].version;

    say('Uploading the avatar file');
    const start = await request(`file/${fileId}/${version}/file/start`, { method: 'PUT' });
    await put(start.url, base64, 'application/octet-stream', fileMd5);
    await request(`file/${fileId}/${version}/file/finish`, { method: 'PUT', params: { maxParts: 0, nextPartNumber: 0 } });

    say('Uploading the signature');
    const sigStart = await request(`file/${fileId}/${version}/signature/start`, { method: 'PUT' });
    await put(sigStart.url, sig, 'application/x-rsync-signature', sigMd5);
    await request(`file/${fileId}/${version}/signature/finish`, { method: 'PUT', params: { maxParts: 0, nextPartNumber: 0 } });

    say('Attaching it to the avatar');
    const assetUrl = `https://api.vrchat.cloud/api/1/file/${fileId}/${version}/file`;
    await request(`avatars/${avatarId}`, {
        method: 'PUT',
        params: { assetUrl, unityPackageUrl: assetUrl, platform, unityVersion: header.unityVersion, assetVersion: 1 }
    });
    const after = await request(`avatars/${avatarId}`, { method: 'GET' });
    const now = bundleFor(after, platform);
    if (!now || !(after.unityPackages || []).some((p) => String(p.assetUrl).includes(`/${fileId}/${version}/`))) {
        throw new Error('The file uploaded, but VRChat did not attach it to the avatar.');
    }
    return { avatar: after, unityVersion: header.unityVersion };
}
