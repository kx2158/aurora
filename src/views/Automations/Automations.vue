<template>
    <div class="a-page">
        <div class="a-page-inner">
            <header class="a-head">
                <div>
                    <h1 class="a-title">{{ t('view.automations.title') }}</h1>
                    <p class="a-sub">{{ t('view.automations.sub') }}</p>
                </div>
            </header>

            <section class="a-card">
                <h2 class="a-h2">
                    <AuroraIcon name="alarm" :size="15" /> {{ t('view.automations.alarms') }}
                    <span class="a-h2-aside flex gap-2">
                        <button v-for="m in [5, 15, 30, 60]" :key="m" type="button" class="a-btn" @click="addTimer(m)">
                            {{ m < 60 ? t('view.automations.minutes', { n: m }) : t('view.automations.hour') }}
                        </button>
                    </span>
                </h2>
                <p v-if="!alarms.length" class="a-empty">{{ t('view.automations.no_alarms') }}</p>
                <div v-for="a in alarms" :key="a.id" class="auto-alarm">
                    <input v-model="a.time" type="time" class="a-input auto-time" :aria-label="t('view.automations.time')" />
                    <input
                        v-model="a.label"
                        class="a-input flex-1"
                        maxlength="60"
                        :placeholder="t('view.automations.label')"
                        :aria-label="t('view.automations.label')" />
                    <div class="a-seg">
                        <button type="button" :class="{ on: a.daily }" @click="a.daily = true">
                            {{ t('view.automations.daily') }}
                        </button>
                        <button type="button" :class="{ on: !a.daily }" @click="a.daily = false">
                            {{ t('view.automations.once') }}
                        </button>
                    </div>
                    <button
                        type="button"
                        class="a-toggle"
                        :class="{ on: a.enabled }"
                        :aria-pressed="a.enabled"
                        :aria-label="t('view.automations.enabled')"
                        @click="a.enabled = !a.enabled"></button>
                    <button
                        type="button"
                        class="a-btn icon"
                        :aria-label="t('view.automations.remove')"
                        @click="removeAlarm(a.id)">
                        <AuroraIcon name="close" :size="14" />
                    </button>
                </div>
                <div class="mt-4 flex gap-2">
                    <button type="button" class="a-btn" @click="addAlarm">
                        <AuroraIcon name="plus" :size="15" /> {{ t('view.automations.add_alarm') }}
                    </button>
                    <button type="button" class="a-btn" @click="ringAlarm">{{ t('view.automations.test') }}</button>
                </div>
            </section>

            <section class="a-card">
                <h2 class="a-h2">
                    <AuroraIcon name="status" :size="15" /> {{ t('view.automations.status') }}
                    <span class="a-h2-aside">
                        <button
                            type="button"
                            class="a-toggle"
                            :class="{ on: rules.enabled }"
                            :aria-pressed="rules.enabled"
                            :aria-label="t('view.automations.status')"
                            @click="setRule('enabled', !rules.enabled)"></button>
                    </span>
                </h2>
                <p class="a-note mb-3">{{ t('view.automations.status_desc') }}</p>
                <div class="a-field">
                    <div class="a-field-label">{{ t('view.automations.switch_to') }}</div>
                    <div class="a-field-control">
                        <div class="a-seg">
                            <button
                                v-for="s in statuses"
                                :key="s.value"
                                type="button"
                                :class="{ on: rules.status === s.value }"
                                @click="setRule('status', s.value)">
                                {{ s.label }}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="a-field">
                    <div class="a-field-label">{{ t('view.automations.status_text') }}</div>
                    <div class="a-field-control">
                        <input
                            :value="rules.desc"
                            class="a-input"
                            maxlength="32"
                            :placeholder="t('view.automations.optional')"
                            @change="(e) => setRule('desc', e.target.value)" />
                    </div>
                </div>
                <div class="a-field">
                    <div class="a-field-label">{{ t('view.automations.restore') }}</div>
                    <div class="a-field-control">
                        <button
                            type="button"
                            class="a-toggle"
                            :class="{ on: rules.restore }"
                            :aria-pressed="rules.restore"
                            :aria-label="t('view.automations.restore')"
                            @click="setRule('restore', !rules.restore)"></button>
                    </div>
                </div>
                <div class="a-field">
                    <div class="a-field-label">
                        {{ t('view.automations.people') }}
                        <small>{{ t('view.automations.people_hint') }}</small>
                    </div>
                    <div class="a-field-control">
                        <input
                            v-model="watchName"
                            class="a-input"
                            list="aurora-friend-names"
                            :placeholder="t('view.automations.friend_name')"
                            @keydown.enter="addWatchedByName" />
                        <datalist id="aurora-friend-names">
                            <option v-for="n in friendNames" :key="n" :value="n"></option>
                        </datalist>
                        <button type="button" class="a-btn icon" :aria-label="t('view.automations.add')" @click="addWatchedByName">
                            <AuroraIcon name="plus" :size="15" />
                        </button>
                    </div>
                </div>
                <div v-if="rules.ids.length" class="flex flex-wrap gap-2 pt-1">
                    <span v-for="w in rules.ids" :key="w.id" class="auto-chip">
                        {{ w.name }}
                        <button type="button" :aria-label="t('view.automations.remove')" @click="removeWatched(w.id)">
                            <AuroraIcon name="close" :size="12" />
                        </button>
                    </span>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref } from 'vue';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from '../../components/AuroraIcon.vue';
    import { addAlarm, addTimer, alarms, initAlarms, removeAlarm, ringAlarm } from '../../services/auroraAlarms';
    import { addWatched, initStatusRules, removeWatched, rules, saveRules } from '../../services/auroraStatusRules';
    import { useFriendStore } from '../../stores';

    const { t } = useI18n();
    const friendStore = useFriendStore();
    const watchName = ref('');

    onMounted(() => {
        initAlarms();
        initStatusRules();
    });

    const statuses = computed(() => [
        { value: 'busy', label: t('view.automations.busy') },
        { value: 'ask me', label: t('view.automations.ask_me') },
        { value: 'active', label: t('view.automations.online') },
        { value: 'join me', label: t('view.automations.join_me') }
    ]);

    const friendNames = computed(() =>
        Array.from(friendStore.friends.values())
            .map((f) => f.name || f.ref?.displayName)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))
    );

    function setRule(key, value) {
        rules.value[key] = value;
        saveRules();
    }

    function addWatchedByName() {
        const q = watchName.value.trim().toLowerCase();
        if (!q) {
            return;
        }
        const hit = Array.from(friendStore.friends.values()).find(
            (f) => String(f.name || f.ref?.displayName || '').toLowerCase() === q
        );
        if (!hit) {
            toast.error(t('view.automations.not_found'));
            return;
        }
        addWatched(hit.id, hit.name || hit.ref?.displayName);
        watchName.value = '';
    }
</script>

<style scoped>
    .auto-alarm {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 0;
        border-top: 1px solid var(--a-line);
    }
    .auto-alarm:first-of-type {
        border-top: 0;
    }
    .auto-time {
        width: 120px;
        font-variant-numeric: tabular-nums;
    }
    .auto-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 6px 0 12px;
        font-size: 0.8rem;
        border-radius: 999px;
        border: 1px solid var(--a-line);
        background: var(--a-soft);
    }
    .auto-chip button {
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        color: var(--a-muted);
    }
    .auto-chip button:hover {
        color: var(--foreground);
        background: var(--a-line);
    }
</style>
