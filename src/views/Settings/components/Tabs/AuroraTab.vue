<template>
    <div class="flex flex-col gap-10 py-2">
        <SettingsGroup :title="t('view.settings.aurora.header')">
            <SettingsItem
                :label="t('view.settings.aurora.enabled')"
                :description="t('view.settings.aurora.enabled_desc')"
                toggle>
                <Switch
                    :model-value="mascotVoiceEnabled"
                    :ariaLabel="t('view.settings.aurora.enabled')"
                    @update:modelValue="setMascotVoiceEnabled" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.voice')">
                <Select
                    :model-value="mascotVoice"
                    :disabled="!mascotVoiceEnabled"
                    :ariaLabel="t('view.settings.aurora.voice')"
                    @update:modelValue="setMascotVoice">
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem v-for="v in VOICES" :key="v.id" :value="v.id">{{ v.label }}</SelectItem>
                    </SelectContent>
                </Select>
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.speed') + ' ' + mascotVoiceSpeed.toFixed(2) + 'x'">
                <Slider
                    class="w-48"
                    :model-value="[mascotVoiceSpeed]"
                    :min="0.7"
                    :max="1.4"
                    :step="0.05"
                    :disabled="!mascotVoiceEnabled"
                    @update:modelValue="(v) => setMascotVoiceSpeed(v[0])" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.volume') + ' ' + Math.round(mascotVoiceVolume * 100) + '%'">
                <Slider
                    class="w-48"
                    :model-value="[mascotVoiceVolume]"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    :disabled="!mascotVoiceEnabled"
                    @update:modelValue="(v) => setMascotVoiceVolume(v[0])" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.test')">
                <Button size="sm" variant="outline" :disabled="!mascotVoiceEnabled || busy" @click="testVoice">
                    {{ t('view.settings.aurora.test') }}
                </Button>
            </SettingsItem>
        </SettingsGroup>
    </div>
</template>

<script setup>
    import { ref } from 'vue';
    import { Button } from '@/components/ui/button';
    import { Switch } from '@/components/ui/switch';
    import { Slider } from '@/components/ui/slider';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { useAuroraSettingsStore } from '@/stores';
    import { speak, VOICES } from '@/services/auroraVoice';

    import SettingsGroup from '../SettingsGroup.vue';
    import SettingsItem from '../SettingsItem.vue';

    const { t } = useI18n();
    const store = useAuroraSettingsStore();
    const { mascotVoiceEnabled, mascotVoice, mascotVoiceSpeed, mascotVoiceVolume } = storeToRefs(store);
    const { setMascotVoiceEnabled, setMascotVoice, setMascotVoiceSpeed, setMascotVoiceVolume } = store;

    const busy = ref(false);

    async function testVoice() {
        busy.value = true;
        try {
            await speak(t('view.settings.aurora.test_line'), {
                voice: mascotVoice.value,
                speed: mascotVoiceSpeed.value,
                volume: mascotVoiceVolume.value
            });
        } catch (err) {
            console.error(err);
            toast.error(t('view.settings.aurora.error'));
        } finally {
            busy.value = false;
        }
    }
</script>
