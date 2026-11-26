<template>
    <div class="a-page">
        <div class="a-page-inner">
            <header class="a-head">
                <div>
                    <h1 class="a-title">{{ t('view.modules.title') }}</h1>
                    <p class="a-sub">{{ t('view.modules.sub') }}</p>
                </div>
            </header>

            <section class="a-card">
                <h2 class="a-h2"><AuroraIcon name="puzzle" :size="15" /> {{ t('view.modules.make') }}</h2>
                <p class="a-note mb-3">{{ t('view.modules.make_desc') }}</p>
                <div class="flex flex-wrap items-center gap-2 mb-3">
                    <button type="button" class="a-btn" @click="copyPrompt">{{ t('view.modules.copy_prompt') }}</button>
                    <button type="button" class="a-btn" @click="showConnectors = !showConnectors">
                        {{ showConnectors ? t('view.modules.hide_connectors') : t('view.modules.show_connectors') }}
                    </button>
                </div>
                <div v-if="showConnectors">
                    <div v-for="c in CONNECTORS" :key="c.name" class="mb-2">
                        <code class="text-sm">{{ c.sig }}</code>
                        <p class="a-note">{{ c.desc }}</p>
                    </div>
                </div>
            </section>

            <section class="a-card">
                <h2 class="a-h2"><AuroraIcon name="plus" :size="15" /> {{ t('view.modules.install') }}</h2>
                <p class="a-note mb-3">{{ t('view.modules.trust') }}</p>
                <div class="flex flex-wrap items-center gap-2 mb-3">
                    <input type="file" accept=".js,.txt" :aria-label="t('view.modules.pick')" @change="onFile" />
                </div>
                <textarea v-model="pasted" class="a-input w-full" rows="6" spellcheck="false" :placeholder="t('view.modules.paste')" />
                <div class="flex items-center gap-2 mt-2">
                    <button type="button" class="a-btn" :disabled="!pasted.trim()" @click="install(pasted)">{{ t('view.modules.install_btn') }}</button>
                    <span v-if="message" class="a-note">{{ message }}</span>
                </div>
            </section>

            <p v-if="!modules.length" class="a-empty">{{ t('view.modules.none') }}</p>
            <section v-for="m in modules" :key="m.id" class="a-card">
                <div class="flex items-center gap-3">
                    <h2 class="a-h2 flex-1">
                        <AuroraIcon name="puzzle" :size="15" /> {{ m.name }}
                        <span class="a-note">{{ m.version }}</span>
                    </h2>
                    <Switch :model-value="m.enabled" :ariaLabel="m.name" @update:modelValue="(v) => setModuleEnabled(m.id, v)" />
                    <button type="button" class="a-btn" @click="removeModule(m.id)">{{ t('view.modules.remove') }}</button>
                </div>
                <p v-if="m.description" class="a-note">{{ m.description }}</p>
                <p v-if="m.error" class="a-note" style="color: var(--destructive, #d33)">{{ m.error }}</p>
                <div v-if="m.enabled && m.options?.length" class="mt-3 flex flex-col gap-2">
                    <label v-for="o in m.options" :key="o.key" class="flex items-center gap-3">
                        <span class="a-note flex-1">{{ o.label }}</span>
                        <Switch v-if="o.type === 'bool'" :model-value="!!moduleOpts[m.id]?.[o.key]" :ariaLabel="o.label" @update:modelValue="(v) => setModuleOption(m.id, o.key, v)" />
                        <input
                            v-else
                            class="a-input"
                            :type="o.type === 'number' ? 'number' : 'text'"
                            :value="moduleOpts[m.id]?.[o.key]"
                            :aria-label="o.label"
                            @input="(e) => setModuleOption(m.id, o.key, o.type === 'number' ? Number(e.target.value) : e.target.value)" />
                    </label>
                </div>
                <div v-for="p in panelsOf(m.id)" :key="p.key" class="mt-3">
                    <div class="a-note">{{ p.title }}</div>
                    <div :ref="(el) => mountPanel(el, p)" />
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { onMounted, ref } from 'vue';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { Switch } from '@/components/ui/switch';
    import { buildStarterPrompt, CONNECTORS } from '@/services/moduleGuide';
    import { initModules, installModule, modulePanels, moduleOpts, modules, removeModule, setModuleEnabled, setModuleOption } from '@/services/auroraModules';

    const { t } = useI18n();
    const pasted = ref('');
    const message = ref('');
    const showConnectors = ref(false);
    const mounted = new WeakSet();

    onMounted(initModules);

    const panelsOf = (id) => modulePanels.value.filter((p) => p.modId === id);

    function mountPanel(el, p) {
        if (!el || mounted.has(el)) return;
        mounted.add(el);
        try {
            p.render?.(el);
        } catch (e) {
            el.textContent = String(e?.message || e);
        }
    }

    async function copyPrompt() {
        try {
            await navigator.clipboard.writeText(buildStarterPrompt());
            toast.success(t('view.modules.copied'));
        } catch {
            toast.error(t('view.modules.copy_failed'));
        }
    }

    function install(source) {
        try {
            const m = installModule(source);
            message.value = t('view.modules.installed', { name: m.name });
            pasted.value = '';
        } catch (e) {
            message.value = String(e?.message || e);
            toast.error(message.value);
        }
    }

    async function onFile(e) {
        const file = e.target.files?.[0];
        if (file) install(await file.text());
        e.target.value = '';
    }
</script>
