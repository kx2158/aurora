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

            <header class="a-head mt-4">
                <div>
                    <h2 class="text-lg font-semibold">{{ t('view.automations.status') }}</h2>
                    <p class="a-sub">{{ t('view.automations.status_desc') }}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="a-note">{{ statusRules.enabled ? t('view.automations.on') : t('view.automations.off') }}</span>
                    <button
                        type="button"
                        class="a-toggle"
                        :class="{ on: statusRules.enabled }"
                        :aria-pressed="statusRules.enabled"
                        :aria-label="t('view.automations.status')"
                        @click="statusRules.enabled = !statusRules.enabled"></button>
                </div>
            </header>

            <section
                v-for="(rule, i) in statusRules.rules"
                :key="rule.id"
                class="a-card rule"
                :class="{ off: !rule.enabled || !statusRules.enabled }">
                <div class="rule-head">
                    <span class="rule-num">{{ i + 1 }}</span>
                    <div class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate text-sm font-medium">{{ ruleTitle(rule) }}</span>
                        <span class="rule-live" :class="phaseOf(rule)">{{ liveText(rule) }}</span>
                    </div>
                    <button type="button" class="a-btn icon" :disabled="i === 0" :aria-label="t('view.automations.up')" @click="moveRule(rule.id, -1)">
                        <AuroraIcon name="arrow" :size="14" style="transform: rotate(-90deg)" />
                    </button>
                    <button
                        type="button"
                        class="a-btn icon"
                        :disabled="i === statusRules.rules.length - 1"
                        :aria-label="t('view.automations.down')"
                        @click="moveRule(rule.id, 1)">
                        <AuroraIcon name="arrow" :size="14" style="transform: rotate(90deg)" />
                    </button>
                    <button
                        type="button"
                        class="a-toggle"
                        :class="{ on: rule.enabled }"
                        :aria-pressed="rule.enabled"
                        :aria-label="t('view.automations.enabled')"
                        @click="rule.enabled = !rule.enabled"></button>
                    <button type="button" class="a-btn icon" :aria-label="t('view.automations.remove')" @click="removeRule(rule.id)">
                        <AuroraIcon name="close" :size="14" />
                    </button>
                </div>

                <div class="rule-steps">
                    <div class="rule-step">
                        <span class="rule-step-n">1</span>
                        <div class="rule-step-body">
                            <span class="rule-step-label">{{ t('view.automations.step_who') }}</span>
                            <PeoplePicker :people="rule.people" :placeholder="t('view.automations.friend_name')" />
                            <LangPick :group="rule" />
                        </div>
                    </div>
                    <div class="rule-step">
                        <span class="rule-step-n">2</span>
                        <div class="rule-step-body">
                            <span class="rule-step-label">{{ t('view.automations.step_online') }}</span>
                            <StatusPick v-model="rule.onlineStatus" v-model:desc="rule.onlineDesc" />
                        </div>
                    </div>
                    <div class="rule-step">
                        <span class="rule-step-n">3</span>
                        <div class="rule-step-body">
                            <span class="rule-step-label">
                                {{ t('view.automations.step_joined_a') }}
                                <input
                                    v-model.number="rule.waitMin"
                                    type="number"
                                    min="1"
                                    max="240"
                                    class="a-input rule-min"
                                    :aria-label="t('view.automations.minutes_label')" />
                                {{ t('view.automations.step_joined_b') }}
                            </span>
                            <StatusPick v-model="rule.joinedStatus" v-model:desc="rule.joinedDesc" allow-keep />
                            <span class="a-note">{{ t('view.automations.joined_note') }}</span>
                        </div>
                    </div>
                    <div class="rule-step">
                        <span class="rule-step-n">4</span>
                        <div class="rule-step-body">
                            <span class="rule-step-label">{{ t('view.automations.step_fallback', { n: rule.waitMin || 10 }) }}</span>
                            <StatusPick v-model="rule.fallbackStatus" v-model:desc="rule.fallbackDesc" />
                        </div>
                    </div>
                    <div class="rule-step">
                        <span class="rule-step-n">5</span>
                        <div class="rule-step-body rule-step-row">
                            <span class="rule-step-label">{{ t('view.automations.step_offline') }}</span>
                            <button
                                type="button"
                                class="a-toggle"
                                :class="{ on: rule.restore }"
                                :aria-pressed="rule.restore"
                                :aria-label="t('view.automations.step_offline')"
                                @click="rule.restore = !rule.restore"></button>
                        </div>
                    </div>
                </div>
            </section>

            <button type="button" class="a-btn self-start" @click="addRule">
                <AuroraIcon name="plus" :size="15" /> {{ t('view.automations.add_rule') }}
            </button>

            <section class="a-card">
                <h2 class="a-h2"><AuroraIcon name="shield" :size="15" /> {{ t('view.automations.avoid') }}</h2>
                <p class="a-note mb-4">{{ t('view.automations.avoid_desc') }}</p>
                <div class="rule-steps">
                    <div class="rule-step">
                        <span class="rule-step-n">-</span>
                        <div class="rule-step-body">
                            <span class="rule-step-label">{{ t('view.automations.avoid_who') }}</span>
                            <PeoplePicker :people="statusRules.avoid.people" :placeholder="t('view.automations.friend_name')" />
                            <LangPick :group="statusRules.avoid" />
                        </div>
                    </div>
                    <div class="rule-step">
                        <span class="rule-step-n">-</span>
                        <div class="rule-step-body">
                            <span class="rule-step-label">{{ t('view.automations.avoid_status') }}</span>
                            <StatusPick v-model="statusRules.avoid.status" v-model:desc="statusRules.avoid.desc" />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { onBeforeUnmount, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from '../../components/AuroraIcon.vue';
    import LangPick from './components/LangPick.vue';
    import PeoplePicker from './components/PeoplePicker.vue';
    import StatusPick from './components/StatusPick.vue';
    import { addAlarm, addTimer, alarms, initAlarms, removeAlarm, ringAlarm } from '../../services/auroraAlarms';
    import {
        addRule,
        initStatusRules,
        moveRule,
        removeRule,
        ruleState,
        statusRules
    } from '../../services/auroraStatusRules';

    const { t, locale } = useI18n();

    function langName(code) {
        try {
            const n = new Intl.DisplayNames([locale.value || 'en', 'en'], { type: 'language' }).of(code);
            return n ? n.charAt(0).toUpperCase() + n.slice(1) : code;
        } catch {
            return code;
        }
    }

    // ticks once a second so the countdowns move
    const now = ref(Date.now());
    let tick = null;
    onMounted(() => {
        initAlarms();
        initStatusRules();
        tick = setInterval(() => (now.value = Date.now()), 1000);
    });
    onBeforeUnmount(() => clearInterval(tick));

    function ruleTitle(rule) {
        const langs = (rule.langs || []).map((l) => langName(l));
        if (!rule.people.length && !langs.length) {
            return t('view.automations.rule_empty');
        }
        const names = [...rule.people.map((p) => p.name), ...(langs.length ? [t('view.automations.speakers', { langs: langs.join(' / ') })] : [])];
        return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
    }

    const phaseOf = (rule) => ruleState.value[rule.id]?.phase || 'idle';

    function liveText(rule) {
        const st = ruleState.value[rule.id];
        if (!statusRules.value.enabled || !rule.enabled) {
            return t('view.automations.live_off');
        }
        if (!st) {
            return t('view.automations.live_idle');
        }
        if (st.phase === 'waiting') {
            const left = Math.max(0, Math.round((st.until - now.value) / 1000));
            const mm = Math.floor(left / 60);
            const ss = String(left % 60).padStart(2, '0');
            return t('view.automations.live_waiting', { time: `${mm}:${ss}` });
        }
        if (st.phase === 'fallback') {
            return t('view.automations.live_fallback');
        }
        return t('view.automations.live_joined');
    }
</script>

<style scoped>
    .rule {
        display: flex;
        flex-direction: column;
        gap: 16px;
        transition: opacity 0.2s ease;
    }
    .rule.off {
        opacity: 0.55;
    }
    .rule-head {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .rule-num {
        flex: none;
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        font-size: 0.78rem;
        font-weight: 600;
        border-radius: 50%;
        background: var(--a-soft);
        border: 1px solid var(--a-line);
    }
    .rule-live {
        font-size: 0.75rem;
        color: var(--a-muted);
        font-variant-numeric: tabular-nums;
    }
    .rule-live.waiting,
    .rule-live.joined {
        color: var(--a-accent);
    }
    .rule-live.fallback {
        color: #e88134;
    }
    .rule-steps {
        display: flex;
        flex-direction: column;
    }
    .rule-step {
        display: flex;
        gap: 14px;
        padding: 12px 0;
        border-top: 1px solid var(--a-line);
    }
    .rule-step-n {
        flex: none;
        width: 26px;
        text-align: center;
        font-size: 0.75rem;
        color: var(--a-muted);
        padding-top: 2px;
    }
    .rule-step-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .rule-step-row {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }
    .rule-step-label {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        font-size: 0.86rem;
    }
    .rule-min {
        width: 64px;
        height: 28px;
        text-align: center;
    }

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
</style>
