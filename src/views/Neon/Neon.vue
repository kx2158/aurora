<template>
    <div class="nx-neon x-container">
        <div class="nx-neon-head">
            <h1 class="nx-neon-title">{{ t('view.neon.title') }}</h1>
            <p class="nx-neon-sub">{{ t('view.neon.sub') }}</p>
            <div class="nx-chips">
                <button v-for="c in chips" :key="c.id" type="button" class="nx-chip" @click="jump(c.id)">
                    {{ t('view.neon.' + c.label) }}
                </button>
            </div>
        </div>
        <div ref="body" class="nx-neon-body">
            <AuroraTab />
        </div>
    </div>
</template>

<script setup>
    import { ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraTab from '../Settings/components/Tabs/AuroraTab.vue';

    const { t } = useI18n();
    const body = ref(null);

    const chips = [
        { id: 'nx-boops', label: 'jump_boops' },
        { id: 'nx-chatbox', label: 'jump_chatbox' },
        { id: 'nx-music', label: 'jump_music' },
        { id: 'nx-alarms', label: 'jump_alarms' },
        { id: 'nx-rules', label: 'jump_rules' },
        { id: 'nx-people', label: 'jump_people' },
        { id: 'nx-character', label: 'jump_character' },
        { id: 'nx-addons', label: 'jump_addons' },
        { id: 'nx-accent', label: 'jump_accent' },
        { id: 'nx-voice', label: 'jump_voice' },
        { id: 'nx-companion', label: 'jump_companion' },
        { id: 'nx-security', label: 'jump_security' },
        { id: 'nx-cleanup', label: 'jump_cleanup' }
    ];

    function jump(id) {
        const el = body.value?.querySelector('#' + id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
</script>

<style scoped>
    .nx-neon {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }
    .nx-neon-head {
        flex: none;
        padding: 20px 26px 12px;
        border-bottom: 1px solid var(--border);
    }
    .nx-neon-title {
        font-size: 1.8rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--foreground);
        text-shadow: 3px 0 var(--primary);
    }
    .nx-neon-sub {
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        font-size: 12px;
        color: var(--muted-foreground);
        margin-bottom: 10px;
    }
    .nx-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .nx-chip {
        height: 30px;
        padding: 0 14px;
        font-size: 12px;
        font-weight: 700;
        color: var(--primary);
        border: 1px solid var(--primary);
        clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
    }
    .nx-chip:hover {
        background: var(--primary);
        color: var(--primary-foreground);
    }
    .nx-neon-body {
        flex: 1;
        overflow-y: auto;
        padding: 18px 26px 40px;
    }
</style>
