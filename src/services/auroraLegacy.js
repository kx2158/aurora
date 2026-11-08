/**
 * One-time tidy up after the assistant (voice, mascots, boops, pranks) was taken out of Aurora:
 * forgets its settings and deletes the downloaded voice model and the recorded voice lines.
 * Friend history, notes and everything else stay untouched.
 */
import { initStatusRules } from './auroraStatusRules';
import configRepository from './config';

const OLD_KEYS = [
    'Aurora_charV2',
    'Aurora_companionEnabled',
    'Aurora_noteReminders',
    'Aurora_mascotFx',
    'Aurora_mascotFxPreset',
    'Aurora_mascotReverb',
    'Aurora_mascotVoice',
    'Aurora_mascotVoiceEnabled',
    'Aurora_mascotVoiceSpeed',
    'Aurora_mascotVoiceVolume',
    'Neon_addonUnlocked',
    'Neon_addonVoice',
    'Neon_boopCode',
    'Neon_boopsPass',
    'Neon_boopsUnlocked',
    'Neon_character',
    'Neon_companionHome',
    'Neon_personRules',
    'Neon_statusRules'
];

export async function forgetOldAssistant() {
    try {
        if (await configRepository.getBool('Aurora_assistantRemoved', false)) {
            return;
        }
        // the old single status rule must have been moved into the new rules first
        await initStatusRules();
        const moved = await configRepository.getString('Aurora_statusRulesV2', '');
        for (const key of OLD_KEYS) {
            if (key === 'Neon_statusRules' && !moved) {
                continue;
            }
            await configRepository.remove(key);
        }
        // recorded voice lines
        try {
            indexedDB.deleteDatabase('neon-voice');
        } catch {
            // nothing stored
        }
        // the downloaded voice model (about 90 MB)
        try {
            if (typeof caches !== 'undefined') {
                for (const name of await caches.keys()) {
                    if (/transformers|onnx|kokoro/i.test(name)) {
                        await caches.delete(name);
                    }
                }
            }
        } catch {
            // no cache storage
        }
        await configRepository.setBool('Aurora_assistantRemoved', true);
    } catch (e) {
        console.warn('Aurora tidy up', e);
    }
}
