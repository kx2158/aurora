<template>
    <div class="lp">
        <span class="lp-label">{{ t('view.automations.langs_label') }}</span>
        <span v-for="code in langs" :key="code" class="lp-chip on">
            {{ nameOf(code) }}
            <button type="button" :aria-label="t('view.automations.remove')" @click="remove(code)">
                <AuroraIcon name="close" :size="11" />
            </button>
        </span>
        <select class="a-select lp-add" :value="''" :aria-label="t('view.automations.langs_add')" @change="add">
            <option value="">{{ t('view.automations.langs_add') }}</option>
            <option v-for="l in available" :key="l.code" :value="l.code">{{ l.name }}</option>
        </select>
        <span v-if="matches.length" class="lp-now">{{ t('view.automations.langs_now', { names: matches.map((m) => m.name).join(', ') }) }}</span>
    </div>
</template>

<script setup>
    import { computed } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from '../../../components/AuroraIcon.vue';
    import { languageMatches } from '../../../services/auroraStatusRules';
    import { languageMappings } from '../../../shared/constants/language';
    import { useUserStore } from '../../../stores';

    /**
     * Count friends in automatically when their VRChat profile lists a language.
     * Any language VRChat offers can be picked. Edits group.langs (ISO 639-3 codes) in place.
     */
    const props = defineProps({
        group: { type: Object, required: true }
    });
    const { t, locale } = useI18n();
    const userStore = useUserStore();

    const langs = computed(() => props.group.langs || []);
    const matches = computed(() => languageMatches(props.group));

    // VRChat's own list of profile languages when it has loaded, otherwise the ones Aurora knows
    const allLanguages = computed(() => {
        const fromVrc = userStore.subsetOfLanguages;
        const codes =
            fromVrc && typeof fromVrc === 'object' && Object.keys(fromVrc).length
                ? Object.keys(fromVrc)
                : Object.keys(languageMappings);
        return codes.map((code) => ({ code, name: nameOf(code) })).sort((a, b) => a.name.localeCompare(b.name));
    });
    const available = computed(() => allLanguages.value.filter((l) => !langs.value.includes(l.code)));

    let display = null;
    function nameOf(code) {
        try {
            display = display || new Intl.DisplayNames([locale.value || 'en', 'en'], { type: 'language' });
            const n = display.of(code);
            if (n && n.toLowerCase() !== code) {
                return n.charAt(0).toUpperCase() + n.slice(1);
            }
        } catch {
            // fall through
        }
        const fromVrc = userStore.subsetOfLanguages?.[code];
        return typeof fromVrc === 'string' ? fromVrc : code.toUpperCase();
    }

    function add(e) {
        const code = e.target.value;
        e.target.value = '';
        if (!code) {
            return;
        }
        if (!Array.isArray(props.group.langs)) {
            props.group.langs = [];
        }
        if (!props.group.langs.includes(code)) {
            props.group.langs.push(code);
        }
    }

    function remove(code) {
        const i = props.group.langs.indexOf(code);
        if (i >= 0) {
            props.group.langs.splice(i, 1);
        }
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
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 26px;
        padding: 0 5px 0 11px;
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
    .lp-chip button {
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        color: var(--a-muted);
    }
    .lp-chip button:hover {
        color: var(--foreground);
        background: var(--a-line);
    }
    .lp-add {
        width: 170px;
        height: 28px;
        font-size: 0.78rem;
    }
    .lp-now {
        flex-basis: 100%;
        font-size: 0.75rem;
        color: var(--a-accent);
    }
</style>
