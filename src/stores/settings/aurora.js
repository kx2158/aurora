import { defineStore } from 'pinia';
import { ref } from 'vue';

import { hashPin, isValidPin, lockoutSeconds, verifyPin } from '../../services/auroraSecurity';
import { FX_PRESETS } from '../../services/auroraVoiceFx';
import configRepository from '../../services/config';

export const useAuroraSettingsStore = defineStore('AuroraSettings', () => {
    const mascotVoiceEnabled = ref(false);
    const mascotVoice = ref('af_heart');
    const mascotVoiceSpeed = ref(1);
    const mascotVoiceVolume = ref(0.8);
    const mascotFxPreset = ref('robot');
    const mascotFx = ref({ ...FX_PRESETS.robot });

    // app lock
    const ready = ref(false);
    const locked = ref(false);
    const appLockEnabled = ref(false);
    const autoLockMinutes = ref(10);
    const failedAttempts = ref(0);
    const lockedUntil = ref(0);
    let pinHash = '';

    async function initAuroraSettings() {
        const [enabled, voice, speed, volume, preset, fxJson, lockHash, autoMin, fails, until] = await Promise.all([
            configRepository.getBool('Aurora_mascotVoiceEnabled', false),
            configRepository.getString('Aurora_mascotVoice', 'af_heart'),
            configRepository.getFloat('Aurora_mascotVoiceSpeed', 1),
            configRepository.getFloat('Aurora_mascotVoiceVolume', 0.8),
            configRepository.getString('Aurora_mascotFxPreset', 'robot'),
            configRepository.getString('Aurora_mascotFx', ''),
            configRepository.getString('Aurora_pinHash', ''),
            configRepository.getInt('Aurora_autoLockMinutes', 10),
            configRepository.getInt('Aurora_failedAttempts', 0),
            configRepository.getFloat('Aurora_lockedUntil', 0)
        ]);
        pinHash = lockHash || '';
        appLockEnabled.value = Boolean(pinHash);
        autoLockMinutes.value = autoMin;
        failedAttempts.value = fails;
        lockedUntil.value = until;
        locked.value = appLockEnabled.value; // locked at every start when a PIN is set
        ready.value = true;
        mascotVoiceEnabled.value = enabled;
        mascotVoice.value = voice;
        mascotVoiceSpeed.value = speed;
        mascotVoiceVolume.value = volume;
        mascotFxPreset.value = preset;
        try {
            mascotFx.value = fxJson ? { ...FX_PRESETS.robot, ...JSON.parse(fxJson) } : { ...(FX_PRESETS[preset] || FX_PRESETS.robot) };
        } catch {
            mascotFx.value = { ...FX_PRESETS.robot };
        }
    }

    function setMascotVoiceEnabled(value) {
        mascotVoiceEnabled.value = value;
        configRepository.setBool('Aurora_mascotVoiceEnabled', value);
    }
    function setMascotVoice(value) {
        mascotVoice.value = value;
        configRepository.setString('Aurora_mascotVoice', value);
    }
    function setMascotVoiceSpeed(value) {
        mascotVoiceSpeed.value = value;
        configRepository.setFloat('Aurora_mascotVoiceSpeed', value);
    }
    function setMascotVoiceVolume(value) {
        mascotVoiceVolume.value = value;
        configRepository.setFloat('Aurora_mascotVoiceVolume', value);
    }

    initAuroraSettings();

    async function setPin(pin) {
        if (!isValidPin(pin)) {
            throw new Error('PIN must be 4 to 12 digits');
        }
        pinHash = await hashPin(pin);
        await configRepository.setString('Aurora_pinHash', pinHash);
        appLockEnabled.value = true;
    }
    async function removePin(currentPin) {
        if (!(await verifyPin(currentPin, pinHash))) {
            return false;
        }
        pinHash = '';
        await configRepository.setString('Aurora_pinHash', '');
        appLockEnabled.value = false;
        locked.value = false;
        return true;
    }
    async function changePin(currentPin, newPin) {
        if (!(await verifyPin(currentPin, pinHash))) {
            return false;
        }
        await setPin(newPin);
        return true;
    }
    /** Returns 'ok', 'wrong' or 'wait' (too many failures, see lockedUntil). */
    async function tryUnlock(pin) {
        if (Date.now() < lockedUntil.value) {
            return 'wait';
        }
        if (await verifyPin(pin, pinHash)) {
            failedAttempts.value = 0;
            configRepository.setInt('Aurora_failedAttempts', 0);
            locked.value = false;
            return 'ok';
        }
        failedAttempts.value += 1;
        configRepository.setInt('Aurora_failedAttempts', failedAttempts.value);
        const wait = lockoutSeconds(failedAttempts.value);
        if (wait > 0) {
            lockedUntil.value = Date.now() + wait * 1000;
            configRepository.setFloat('Aurora_lockedUntil', lockedUntil.value);
        }
        return wait > 0 ? 'wait' : 'wrong';
    }
    function lockNow() {
        if (appLockEnabled.value) {
            locked.value = true;
        }
    }
    function setAutoLockMinutes(value) {
        autoLockMinutes.value = value;
        configRepository.setInt('Aurora_autoLockMinutes', value);
    }

    function setMascotFxPreset(name) {
        mascotFxPreset.value = name;
        configRepository.setString('Aurora_mascotFxPreset', name);
        if (FX_PRESETS[name]) {
            mascotFx.value = { ...FX_PRESETS[name] };
            configRepository.setString('Aurora_mascotFx', JSON.stringify(mascotFx.value));
        }
    }
    function setMascotFxValue(key, value) {
        mascotFx.value = { ...mascotFx.value, [key]: value };
        mascotFxPreset.value = 'custom';
        configRepository.setString('Aurora_mascotFxPreset', 'custom');
        configRepository.setString('Aurora_mascotFx', JSON.stringify(mascotFx.value));
    }

    return {
        ready,
        locked,
        appLockEnabled,
        autoLockMinutes,
        failedAttempts,
        lockedUntil,
        setPin,
        removePin,
        changePin,
        tryUnlock,
        lockNow,
        setAutoLockMinutes,
        mascotFxPreset,
        mascotFx,
        setMascotFxPreset,
        setMascotFxValue,
        mascotVoiceEnabled,
        mascotVoice,
        mascotVoiceSpeed,
        mascotVoiceVolume,
        initAuroraSettings,
        setMascotVoiceEnabled,
        setMascotVoice,
        setMascotVoiceSpeed,
        setMascotVoiceVolume
    };
});
