<template>
    <section class="a-card">
        <div class="flex items-center gap-3">
            <h2 class="a-h2 flex-1">{{ t('view.settings.aurora.stealth.header') }}</h2>
            <Switch :model-value="stealth.on" :disabled="stealthBusy" @update:model-value="(v) => setStealth(!!v)" />
        </div>
        <p class="a-note">{{ stealthBusy ? t('view.settings.aurora.stealth.busy') : t('view.settings.aurora.stealth.on_desc') }}</p>
        <p v-if="stealthFailures.length" class="a-note">
            {{ t('view.settings.aurora.stealth.failed') }} {{ stealthFailures.join(', ') }}
        </p>
    </section>
</template>

<script setup>
    import { useI18n } from 'vue-i18n';

    import { Switch } from '@/components/ui/switch';
    import { setStealth, stealth, stealthBusy, stealthFailures } from '../services/stealthMode';

    /** Stealth mode, now a card at the top of Tools (the corner bubble is gone). */
    const { t } = useI18n();
</script>
