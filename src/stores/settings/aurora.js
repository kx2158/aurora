import { defineStore } from 'pinia';
import { ref } from 'vue';

import { hashPin, isValidPin, lockoutSeconds, verifyPin } from '../../services/auroraSecurity';
import { DEFAULT_SELECTED } from '../../services/auroraCleanup';
import configRepository from '../../services/config';

export const useAuroraSettingsStore = defineStore('AuroraSettings', () => {
    // data cleanup
    const cleanupSelected = ref([...DEFAULT_SELECTED]);
    const cleanupKeepDays = ref(90);
    const cleanupAuto = ref(false);

    // app lock
    const ready = ref(false);
    const locked = ref(false);
    const appLockEnabled = ref(false);
    const autoLockMinutes = ref(10);
    const failedAttempts = ref(0);
    const lockedUntil = ref(0);
    let pinHash = '';

    async function initAuroraSettings() {
        const [lockHash, autoMin, fails, until, selRaw, keepDays, autoClean] = await Promise.all([
            configRepository.getString('Aurora_pinHash', ''),
            configRepository.getInt('Aurora_autoLockMinutes', 10),
            configRepository.getInt('Aurora_failedAttempts', 0),
            configRepository.getFloat('Aurora_lockedUntil', 0),
            configRepository.getString('Aurora_cleanupSelected', ''),
            configRepository.getInt('Aurora_cleanupKeepDays', 90),
            configRepository.getBool('Aurora_cleanupAuto', false)
        ]);
        try {
            cleanupSelected.value = selRaw ? JSON.parse(selRaw) : [...DEFAULT_SELECTED];
        } catch {
            cleanupSelected.value = [...DEFAULT_SELECTED];
        }
        cleanupKeepDays.value = keepDays;
        cleanupAuto.value = autoClean;
        pinHash = lockHash || '';
        appLockEnabled.value = Boolean(pinHash);
        autoLockMinutes.value = autoMin;
        failedAttempts.value = fails;
        lockedUntil.value = until;
        locked.value = appLockEnabled.value; // locked at every start when a PIN is set
        ready.value = true;
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
    function toggleCleanup(key, on) {
        const next = new Set(cleanupSelected.value);
        if (on) {
            next.add(key);
        } else {
            next.delete(key);
        }
        cleanupSelected.value = [...next];
        configRepository.setString('Aurora_cleanupSelected', JSON.stringify(cleanupSelected.value));
    }
    function setCleanupKeepDays(value) {
        cleanupKeepDays.value = value;
        configRepository.setInt('Aurora_cleanupKeepDays', value);
    }
    function setCleanupAuto(value) {
        cleanupAuto.value = value;
        configRepository.setBool('Aurora_cleanupAuto', value);
    }
    function setAutoLockMinutes(value) {
        autoLockMinutes.value = value;
        configRepository.setInt('Aurora_autoLockMinutes', value);
    }

    return {
        cleanupSelected,
        cleanupKeepDays,
        cleanupAuto,
        toggleCleanup,
        setCleanupKeepDays,
        setCleanupAuto,
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
        initAuroraSettings
    };
});
