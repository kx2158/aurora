<template>
    <div class="flex flex-col gap-10 py-2">
        <div class="flex items-center gap-4">
            <AuroraMascot :size="72" />
            <div class="flex flex-col">
                <span class="text-base font-semibold text-foreground">Neon</span>
                <span class="text-xs text-muted-foreground">{{ t('view.settings.aurora.tagline') }}</span>
            </div>
        </div>
        <SettingsGroup :title="t('view.settings.aurora.chatbox')">
            <SettingsItem
                :label="t('view.settings.aurora.chatbox')"
                :description="t('view.settings.aurora.chatbox_desc')"
                toggle>
                <Switch
                    :model-value="chatboxEnabled"
                    :ariaLabel="t('view.settings.aurora.chatbox')"
                    @update:modelValue="setChatboxEnabled" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.chatbox_template')" :description="t('view.settings.aurora.chatbox_template_desc')">
                <Input :model-value="chatboxTemplate" class="w-80" @update:modelValue="setChatboxTemplate" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.chatbox_interval')">
                <Input
                    type="number"
                    min="3"
                    max="60"
                    :model-value="chatboxInterval"
                    class="w-24"
                    @update:modelValue="setChatboxInterval" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.chatbox_notify')" toggle>
                <Switch
                    :model-value="chatboxNotify"
                    :ariaLabel="t('view.settings.aurora.chatbox_notify')"
                    @update:modelValue="setChatboxNotify" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.chatbox_preview')">
                <span class="text-xs text-muted-foreground">{{ chatboxPreview || '...' }}</span>
            </SettingsItem>
        </SettingsGroup>
        <SettingsGroup :title="t('view.settings.aurora.companion')">
            <SettingsItem
                :label="t('view.settings.aurora.companion')"
                :description="t('view.settings.aurora.companion_desc')"
                toggle>
                <Switch
                    :model-value="companionEnabled"
                    :ariaLabel="t('view.settings.aurora.companion')"
                    @update:modelValue="setCompanionEnabled" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.home')" :description="t('view.settings.aurora.home_desc')">
                <Select :model-value="companionHome" @update:modelValue="setCompanionHome">
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="roam">{{ t('view.settings.aurora.home_roam') }}</SelectItem>
                        <SelectItem value="dock">{{ t('view.settings.aurora.home_dock') }}</SelectItem>
                    </SelectContent>
                </Select>
            </SettingsItem>
            <SettingsItem
                :label="t('view.settings.aurora.note_reminders')"
                :description="t('view.settings.aurora.note_reminders_desc')"
                toggle>
                <Switch
                    :model-value="noteReminders"
                    :ariaLabel="t('view.settings.aurora.note_reminders')"
                    @update:modelValue="setNoteReminders" />
            </SettingsItem>
        </SettingsGroup>
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

            <SettingsItem :label="t('view.settings.aurora.fx_preset')">
                <Select
                    :model-value="mascotFxPreset"
                    :disabled="!mascotVoiceEnabled"
                    :ariaLabel="t('view.settings.aurora.fx_preset')"
                    @update:modelValue="setMascotFxPreset">
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="clean">{{ t('view.settings.aurora.fx_clean') }}</SelectItem>
                        <SelectItem value="robot">{{ t('view.settings.aurora.fx_robot') }}</SelectItem>
                        <SelectItem value="glitchy">{{ t('view.settings.aurora.fx_glitchy') }}</SelectItem>
                        <SelectItem value="custom" disabled>{{ t('view.settings.aurora.fx_custom') }}</SelectItem>
                    </SelectContent>
                </Select>
            </SettingsItem>

            <SettingsItem
                v-for="s in fxSliders"
                :key="s.key"
                :label="t('view.settings.aurora.' + s.key) + ' ' + mascotFx[s.key]">
                <Slider
                    class="w-48"
                    :model-value="[mascotFx[s.key]]"
                    :min="s.min"
                    :max="s.max"
                    :step="s.step"
                    :disabled="!mascotVoiceEnabled"
                    @update:modelValue="(v) => setMascotFxValue(s.key, v[0])" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.pack')" :description="t('view.settings.aurora.pack_desc')">
                <div class="flex items-center gap-3">
                    <span class="text-xs text-muted-foreground">{{ pack.done }} / {{ pack.total }}</span>
                    <Button size="sm" variant="outline" :disabled="!mascotVoiceEnabled || pack.running" @click="startPack">
                        {{ pack.running ? t('view.settings.aurora.pack_running') : t('view.settings.aurora.pack_build') }}
                    </Button>
                </div>
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.test')">
                <Button size="sm" variant="outline" :disabled="!mascotVoiceEnabled || busy" @click="testVoice">
                    {{ t('view.settings.aurora.test') }}
                </Button>
            </SettingsItem>
        </SettingsGroup>

        <SettingsGroup :title="t('view.settings.aurora.security.header')">
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

        <SettingsGroup :title="t('view.settings.aurora.cleanup.header')">
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
    import { onMounted, ref } from 'vue';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Switch } from '@/components/ui/switch';
    import {
        companionEnabled,
        companionHome,
        noteReminders,
        setCompanionEnabled,
        setCompanionHome,
        setNoteReminders
    } from '@/services/auroraCompanion';
    import {
        chatboxEnabled,
        chatboxInterval,
        chatboxNotify,
        chatboxPreview,
        chatboxTemplate,
        initChatbox,
        setChatboxEnabled,
        setChatboxInterval,
        setChatboxNotify,
        setChatboxTemplate
    } from '@/services/auroraChatbox';
    import { buildVoicePack, pack } from '@/services/auroraLines';
    import { Slider } from '@/components/ui/slider';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { useAuroraSettingsStore } from '@/stores';
    import { speak, VOICES } from '@/services/auroraVoice';
    import { isValidPin } from '@/services/auroraSecurity';
    import { CLEANUP_KEYS, cleanCategories, countCategory } from '@/services/auroraCleanup';

    import AuroraMascot from '@/components/AuroraMascot.vue';
    import SettingsGroup from '../SettingsGroup.vue';
    import SettingsItem from '../SettingsItem.vue';

    const { t } = useI18n();
    const store = useAuroraSettingsStore();
    const { mascotVoiceEnabled, mascotVoice, mascotVoiceSpeed, mascotVoiceVolume, mascotFxPreset, mascotFx, appLockEnabled, autoLockMinutes, cleanupSelected, cleanupKeepDays, cleanupAuto } =
        storeToRefs(store);
    const {
        setMascotVoiceEnabled,
        setMascotVoice,
        setMascotVoiceSpeed,
        setMascotVoiceVolume,
        setMascotFxPreset,
        setMascotFxValue,
        setAutoLockMinutes,
        lockNow,
        toggleCleanup,
        setCleanupKeepDays,
        setCleanupAuto
    } = store;

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

    const fxSliders = [
        { key: 'bitDepth', min: 2, max: 16, step: 1 },
        { key: 'downsample', min: 1, max: 12, step: 1 },
        { key: 'ringHz', min: 0, max: 200, step: 5 },
        { key: 'ringMix', min: 0, max: 1, step: 0.05 },
        { key: 'glitch', min: 0, max: 0.5, step: 0.02 }
    ];

    const busy = ref(false);

    async function testVoice() {
        busy.value = true;
        try {
            await speak(t('view.settings.aurora.test_line'), {
                voice: mascotVoice.value,
                speed: mascotVoiceSpeed.value,
                volume: mascotVoiceVolume.value,
                fx: { ...mascotFx.value }
            });
        } catch (err) {
            console.error(err);
            toast.error(t('view.settings.aurora.error'));
        } finally {
            busy.value = false;
        }
    }

    function startPack() {
        buildVoicePack({
            voice: mascotVoice.value,
            speed: mascotVoiceSpeed.value,
            fx: { ...mascotFx.value }
        });
    }

    onMounted(() => {
        initChatbox();
    });
</script>
