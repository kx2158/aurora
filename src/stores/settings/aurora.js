import { defineStore } from 'pinia';
import { ref } from 'vue';

import { FX_PRESETS } from '../../services/auroraVoiceFx';
import configRepository from '../../services/config';

export const useAuroraSettingsStore = defineStore('AuroraSettings', () => {
    const mascotVoiceEnabled = ref(false);
    const mascotVoice = ref('af_heart');
    const mascotVoiceSpeed = ref(1);
    const mascotVoiceVolume = ref(0.8);
    const mascotFxPreset = ref('robot');
    const mascotFx = ref({ ...FX_PRESETS.robot });

    async function initAuroraSettings() {
        const [enabled, voice, speed, volume, preset, fxJson] = await Promise.all([
            configRepository.getBool('Aurora_mascotVoiceEnabled', false),
            configRepository.getString('Aurora_mascotVoice', 'af_heart'),
            configRepository.getFloat('Aurora_mascotVoiceSpeed', 1),
            configRepository.getFloat('Aurora_mascotVoiceVolume', 0.8),
            configRepository.getString('Aurora_mascotFxPreset', 'robot'),
            configRepository.getString('Aurora_mascotFx', '')
        ]);
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
