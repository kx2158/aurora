<template>
    <div class="flex flex-col gap-10 py-2">
        <div class="flex items-center gap-4">
            <AuroraLogo :size="44" />
            <div class="flex flex-col">
                <span class="text-base font-semibold text-foreground">Aurora</span>
                <span class="text-xs text-muted-foreground">{{ t('view.settings.aurora.tagline') }}</span>
            </div>
        </div>
        <SettingsGroup id="nx-accent" :title="t('view.settings.aurora.accent')">
            <SettingsItem :label="t('view.settings.aurora.accent_desc')">
                <div class="flex flex-wrap items-center gap-2">
                    <button
                        v-for="p in ACCENT_PRESETS"
                        :key="p.hex"
                        type="button"
                        :title="p.name"
                        class="size-7 rounded-full border-2"
                        :style="{ background: p.hex, borderColor: accent === p.hex ? 'var(--foreground)' : 'transparent', boxShadow: 'none' }"
                        @click="setAccent(p.hex)"></button>
                </div>
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.accent_custom')" :description="t('view.settings.aurora.accent_custom_hint')">
                <AuroraColorWheel :model-value="accent" :label="t('view.settings.aurora.accent_custom')" @update:model-value="setAccent" />
            </SettingsItem>
        </SettingsGroup>
        <SettingsGroup id="nx-security" :title="t('view.settings.aurora.security.header')">
            <SettingsItem
                :label="t('view.settings.aurora.security.status')"
                :description="t('view.settings.aurora.security.desc')">
                <span class="text-sm" :class="appLockEnabled ? 'text-primary' : 'text-muted-foreground'">
                    {{ appLockEnabled ? t('view.settings.aurora.security.on') : t('view.settings.aurora.security.off') }}
                </span>
            </SettingsItem>

            <SettingsItem v-if="appLockEnabled" :label="t('view.settings.aurora.security.current_pin')">
                <Input v-model="currentPin" type="password" inputmode="numeric" maxlength="12" class="h-8 w-40" />
            </SettingsItem>
            <SettingsItem
                v-if="!appLockEnabled || changing"
                :label="t('view.settings.aurora.security.new_pin')"
                :description="t('view.settings.aurora.security.pin_rule')">
                <Input v-model="newPin" type="password" inputmode="numeric" maxlength="12" class="h-8 w-40" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.security.actions')">
                <div class="flex gap-2">
                    <Button v-if="!appLockEnabled" size="sm" :disabled="!isValidPin(newPin)" @click="enableLock">
                        {{ t('view.settings.aurora.security.enable') }}
                    </Button>
                    <template v-else>
                        <Button v-if="!changing" size="sm" variant="outline" @click="changing = true">
                            {{ t('view.settings.aurora.security.change') }}
                        </Button>
                        <Button v-else size="sm" :disabled="!isValidPin(newPin)" @click="changeLock">
                            {{ t('view.settings.aurora.security.save') }}
                        </Button>
                        <Button size="sm" variant="outline" :disabled="currentPin.length < 4" @click="disableLock">
                            {{ t('view.settings.aurora.security.disable') }}
                        </Button>
                        <Button size="sm" variant="outline" @click="lockNow">
                            {{ t('view.settings.aurora.security.lock_now') }}
                        </Button>
                    </template>
                </div>
            </SettingsItem>

            <SettingsItem
                v-if="appLockEnabled"
                :label="
                    t('view.settings.aurora.security.auto_lock') +
                    ' ' +
                    (autoLockMinutes === 0 ? t('view.settings.aurora.security.never') : autoLockMinutes + ' min')
                ">
                <Slider
                    class="w-48"
                    :model-value="[autoLockMinutes]"
                    :min="0"
                    :max="60"
                    :step="5"
                    @update:modelValue="(v) => setAutoLockMinutes(v[0])" />
            </SettingsItem>
        </SettingsGroup>

        <SettingsGroup id="nx-cleanup" :title="t('view.settings.aurora.cleanup.header')">
            <SettingsItem
                v-for="key in CLEANUP_KEYS"
                :key="key"
                :label="t('view.settings.aurora.cleanup.' + key)"
                :description="
                    counts[key] === undefined
                        ? t('view.settings.aurora.cleanup.' + key + '_desc')
                        : t('view.settings.aurora.cleanup.found', { n: counts[key] })
                "
                toggle>
                <Switch
                    :model-value="cleanupSelected.includes(key)"
                    :ariaLabel="t('view.settings.aurora.cleanup.' + key)"
                    @update:modelValue="(on) => toggleCleanup(key, on)" />
            </SettingsItem>

            <SettingsItem
                :label="t('view.settings.aurora.cleanup.keep_days') + ' ' + cleanupKeepDays + ' d'"
                :description="t('view.settings.aurora.cleanup.keep_days_desc')">
                <Slider
                    class="w-48"
                    :model-value="[cleanupKeepDays]"
                    :min="7"
                    :max="365"
                    :step="1"
                    @update:modelValue="(v) => setCleanupKeepDays(v[0])" />
            </SettingsItem>

            <SettingsItem
                :label="t('view.settings.aurora.cleanup.auto')"
                :description="t('view.settings.aurora.cleanup.auto_desc')"
                toggle>
                <Switch
                    :model-value="cleanupAuto"
                    :ariaLabel="t('view.settings.aurora.cleanup.auto')"
                    @update:modelValue="setCleanupAuto" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.cleanup.actions')">
                <div class="flex gap-2">
                    <Button size="sm" variant="outline" :disabled="cleaning" @click="checkSizes">
                        {{ t('view.settings.aurora.cleanup.check') }}
                    </Button>
                    <Button
                        size="sm"
                        :variant="confirming ? 'destructive' : 'default'"
                        :disabled="cleaning || cleanupSelected.length === 0"
                        @click="cleanNow">
                        {{ confirming ? t('view.settings.aurora.cleanup.confirm') : t('view.settings.aurora.cleanup.now') }}
                    </Button>
                </div>
            </SettingsItem>
        </SettingsGroup>
    </div>
</template>

<script setup>
    import { ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Slider } from '@/components/ui/slider';
    import { Switch } from '@/components/ui/switch';
    import { ACCENT_PRESETS, accent, setAccent } from '@/services/auroraAccent';
    import { CLEANUP_KEYS, cleanCategories, countCategory } from '@/services/auroraCleanup';
    import { isValidPin } from '@/services/auroraSecurity';
    import { useAuroraSettingsStore } from '@/stores';

    import AuroraColorWheel from '@/components/AuroraColorWheel.vue';
    import AuroraLogo from '@/components/AuroraLogo.vue';
    import SettingsGroup from '../SettingsGroup.vue';
    import SettingsItem from '../SettingsItem.vue';

    const { t } = useI18n();
    const store = useAuroraSettingsStore();
    const { appLockEnabled, autoLockMinutes, cleanupSelected, cleanupKeepDays, cleanupAuto } = storeToRefs(store);
    const { setAutoLockMinutes, lockNow, toggleCleanup, setCleanupKeepDays, setCleanupAuto } = store;

    const counts = ref({});
    const cleaning = ref(false);
    const confirming = ref(false);
    let confirmTimer = null;

    async function checkSizes() {
        const next = {};
        for (const key of CLEANUP_KEYS) {
            next[key] = await countCategory(key, cleanupKeepDays.value);
        }
        counts.value = next;
    }
    async function cleanNow() {
        if (!confirming.value) {
            confirming.value = true; // second click confirms
            clearTimeout(confirmTimer);
            confirmTimer = setTimeout(() => (confirming.value = false), 5000);
            return;
        }
        confirming.value = false;
        cleaning.value = true;
        try {
            const removed = await cleanCategories(cleanupSelected.value, cleanupKeepDays.value);
            toast.success(t('view.settings.aurora.cleanup.done', { n: removed }));
            counts.value = {};
        } catch (err) {
            console.error(err);
            toast.error(t('view.settings.aurora.cleanup.failed'));
        } finally {
            cleaning.value = false;
        }
    }

    const currentPin = ref('');
    const newPin = ref('');
    const changing = ref(false);

    function resetPinFields() {
        currentPin.value = '';
        newPin.value = '';
        changing.value = false;
    }
    async function enableLock() {
        await store.setPin(newPin.value);
        resetPinFields();
        toast.success(t('view.settings.aurora.security.enabled_toast'));
    }
    async function changeLock() {
        if (await store.changePin(currentPin.value, newPin.value)) {
            toast.success(t('view.settings.aurora.security.changed_toast'));
            resetPinFields();
        } else {
            toast.error(t('view.settings.aurora.lock.wrong'));
        }
    }
    async function disableLock() {
        if (await store.removePin(currentPin.value)) {
            toast.success(t('view.settings.aurora.security.disabled_toast'));
            resetPinFields();
        } else {
            toast.error(t('view.settings.aurora.lock.wrong'));
        }
    }
</script>
