/**
 * Adds a new image version to a file VRChat already has, bypassing the image upload endpoint's processing.
 */
import { request } from './request';
import webApiService from './webapi';

async function put(url, base64, mime, md5) {
    const res = await webApiService.execute({ url, uploadFilePUT: true, fileData: base64, fileMIME: mime, fileMD5: md5 });
    if (res.status !== 200) throw new Error(`file storage answered ${res.status}`);
}

/**
 * @param {string} fileId
 * @param {string} base64 the new image, base64
 * @param {number} sizeInBytes
 * @param {string} [mime]
 */
export async function swapVersion(fileId, base64, sizeInBytes, mime = 'image/png') {
    const fileMd5 = await AppApi.MD5File(base64);
    const signature = await AppApi.SignFile(base64);
    const signatureMd5 = await AppApi.MD5File(signature);
    const signatureSizeInBytes = parseInt(await AppApi.FileLength(signature), 10);

    const created = await request(`file/${fileId}`, {
        method: 'POST',
        params: { fileMd5, fileSizeInBytes: sizeInBytes, signatureMd5, signatureSizeInBytes }
    });
    const version = created.versions[created.versions.length - 1].version;
    const base = `file/${fileId}/${version}`;

    const fileStart = await request(`${base}/file/start`, { method: 'PUT' });
    await put(fileStart.url, base64, mime, fileMd5);
    await request(`${base}/file/finish`, { method: 'PUT', params: { maxParts: 0, nextPartNumber: 0 } });

    const sigStart = await request(`${base}/signature/start`, { method: 'PUT' });
    await put(sigStart.url, signature, 'application/x-rsync-signature', signatureMd5);
    await request(`${base}/signature/finish`, { method: 'PUT', params: { maxParts: 0, nextPartNumber: 0 } });
    return { fileId, version };
}
