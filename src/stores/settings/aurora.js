import { defineStore } from 'pinia';
import { ref } from 'vue';

import configRepository from '../../services/config';

export const useAuroraSettingsStore = defineStore('AuroraSettings', () => {
    const mascotVoiceEnabled = ref(false);
    const mascotVoice = ref('af_heart');
    const mascotVoiceSpeed = ref(1);
    const mascotVoiceVolume = ref(0.8);

    async function initAuroraSettings() {
        const [enabled, voice, speed, volume] = await Promise.all([
            configRepository.getBool('Aurora_mascotVoiceEnabled', false),
            configRepository.getString('Aurora_mascotVoice', 'af_heart'),
            configRepository.getFloat('Aurora_mascotVoiceSpeed', 1),
            configRepository.getFloat('Aurora_mascotVoiceVolume', 0.8)
        ]);
        mascotVoiceEnabled.value = enabled;
        mascotVoice.value = voice;
        mascotVoiceSpeed.value = speed;
        mascotVoiceVolume.value = volume;
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

    return {
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
