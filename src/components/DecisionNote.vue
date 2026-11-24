<template>
    <div class="dn">
        <button type="button" class="a-chip" :class="{ on: d.m === 'keep' }" @click="mark('keep')">
            {{ t('view.friends_manager.review.keep') }}
        </button>
        <button type="button" class="a-chip dn-cut" :class="{ on: d.m === 'cut' }" @click="mark('cut')">
            {{ t('view.friends_manager.review.cut') }}
        </button>
        <input
            class="dn-note"
            :value="d.n"
            :placeholder="t('view.friends_manager.review.note')"
            maxlength="500"
            @change="setDecision(kind, id, { n: $event.target.value.trim() })" />
    </div>
</template>

<script setup>
    import { computed } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { decisions, setDecision } from '../services/decisionNotes';

    const props = defineProps({ kind: { type: String, required: true }, id: { type: String, required: true } });
    const { t } = useI18n();
    const d = computed(() => decisions.value[props.kind]?.[props.id] || { m: '', n: '' });

    // pressing the active mark again clears it
    function mark(m) {
        setDecision(props.kind, props.id, { m: d.value.m === m ? '' : m });
    }
</script>

<style>
    .dn {
        display: flex;
        gap: 6px;
        align-items: center;
        flex: 1;
        min-width: 0;
    }
    .dn .a-chip.on {
        background: var(--aura-ink, currentColor);
        color: var(--aura-paper, #fff);
    }
    .dn-note {
        flex: 1;
        min-width: 120px;
        padding: 6px 8px;
        background: var(--aura-tint, transparent);
        border: 0;
        outline: none;
        color: inherit;
    }
</style>
