<template>
    <div class="lp">
        <span class="lp-label">{{ t('view.automations.langs_label') }}</span>
        <button
            v-for="l in LANGS"
            :key="l.code"
            type="button"
            class="lp-chip"
            :class="{ on: langs.includes(l.code) }"
            :aria-pressed="langs.includes(l.code)"
            @click="toggle(l.code)">
            {{ t(l.label) }}
        </button>
        <span v-if="matches.length" class="lp-now">{{ t('view.automations.langs_now', { names: matches.map((m) => m.name).join(', ') }) }}</span>
    </div>
</template>

<script setup>
    import { computed } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { languageMatches } from '../../../services/auroraStatusRules';

    /**
     * Count friends in automatically when their VRChat profile lists a language.
     * Edits the given array of ISO 639-3 codes in place.
     */
    const props = defineProps({
        group: { type: Object, required: true }
    });
    const { t } = useI18n();

    const LANGS = [
        { code: 'ces', label: 'view.automations.lang_ces' },
        { code: 'slk', label: 'view.automations.lang_slk' }
    ];

    const langs = computed(() => props.group.langs || []);
    const matches = computed(() => languageMatches(props.group));

    function toggle(code) {
        if (!Array.isArray(props.group.langs)) {
            props.group.langs = [];
        }
        const i = props.group.langs.indexOf(code);
        if (i >= 0) props.group.langs.splice(i, 1);
        else props.group.langs.push(code);
    }
</script>

<style scoped>
    .lp {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
    }
    .lp-label {
        font-size: 0.78rem;
        color: var(--a-muted);
        margin-right: 2px;
    }
    .lp-chip {
        height: 26px;
        padding: 0 11px;
        font-size: 0.78rem;
        border-radius: 999px;
        border: 1px solid var(--a-line);
        color: var(--a-muted);
    }
    .lp-chip:hover {
        color: var(--foreground);
    }
    .lp-chip.on {
        color: var(--foreground);
        border-color: color-mix(in oklch, var(--a-accent) 55%, transparent);
        background: color-mix(in oklch, var(--a-accent) 14%, transparent);
    }
    .lp-now {
        flex-basis: 100%;
        font-size: 0.75rem;
        color: var(--a-accent);
    }
</style>
