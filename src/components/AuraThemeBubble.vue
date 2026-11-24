<template>
    <div class="aura-theme-bubble" role="group" :aria-label="t('view.settings.appearance.appearance.theme_mode')">
        <button
            v-for="o in options"
            :key="o.mode"
            type="button"
            :class="{ on: themeMode === o.mode }"
            :aria-pressed="themeMode === o.mode"
            :title="o.label"
            @click="appearance.setThemeMode(o.mode)">
            <component :is="o.icon" :size="16" />
        </button>
        <button
            type="button"
            :class="{ on: stealth.on }"
            :disabled="stealthBusy"
            :aria-pressed="stealth.on"
            :title="stealth.on ? t('view.settings.aurora.stealth.off_tip') : t('view.settings.aurora.stealth.on_tip')"
            @click="setStealth(!stealth.on)">
            <EyeOff :size="16" />
        </button>
    </div>
</template>

<script setup>
    import { EyeOff, Monitor, Moon, Sun } from 'lucide-vue-next';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { setStealth, stealth, stealthBusy } from '../services/stealthMode';
    import { useAppearanceSettingsStore } from '../stores';

    /** Light, dark and follow-Windows, one tap each, always on screen. */
    const { t } = useI18n();
    const appearance = useAppearanceSettingsStore();
    const { themeMode } = storeToRefs(appearance);
    const options = [
        { mode: 'aura', icon: Sun, label: 'Aura' },
        { mode: 'auradark', icon: Moon, label: 'Aura Dark' },
        { mode: 'system', icon: Monitor, label: 'System' }
    ];
</script>
