<template>
    <div class="sp">
        <div class="a-seg">
            <button
                v-for="s in options"
                :key="s.value"
                type="button"
                :class="{ on: modelValue === s.value }"
                @click="$emit('update:modelValue', s.value)">
                <i v-if="s.color" class="sp-dot" :style="{ background: s.color }"></i>
                {{ s.label }}
            </button>
        </div>
        <input
            v-if="modelValue !== 'keep'"
            :value="desc"
            class="a-input sp-text"
            maxlength="32"
            :placeholder="t('view.automations.status_text_ph')"
            @input="(e) => $emit('update:desc', e.target.value)" />
    </div>
</template>

<script setup>
    import { computed } from 'vue';
    import { useI18n } from 'vue-i18n';

    /** VRChat status buttons (with the colours VRChat uses) plus an optional status text. */
    const props = defineProps({
        modelValue: { type: String, required: true },
        desc: { type: String, default: '' },
        allowKeep: { type: Boolean, default: false }
    });
    defineEmits(['update:modelValue', 'update:desc']);
    const { t } = useI18n();

    const options = computed(() => [
        ...(props.allowKeep ? [{ value: 'keep', label: t('view.automations.keep') }] : []),
        { value: 'join me', label: t('view.automations.join_me'), color: '#42caff' },
        { value: 'active', label: t('view.automations.online'), color: '#51e57e' },
        { value: 'ask me', label: t('view.automations.ask_me'), color: '#e88134' },
        { value: 'busy', label: t('view.automations.busy'), color: '#ff5b5b' }
    ]);
</script>

<style scoped>
    .sp {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
    }
    .sp-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        margin-right: 5px;
        border-radius: 50%;
        vertical-align: 1px;
    }
    .sp-text {
        width: 200px;
    }
</style>
