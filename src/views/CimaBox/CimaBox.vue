<template>
    <div class="a-page">
        <div class="a-page-inner">
            <header class="a-head">
                <div>
                    <h1 class="a-title">CIMA Box</h1>
                    <p class="a-sub">{{ t('view.cimabox.desc') }}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="a-btn" @click="openRepo">{{ t('view.cimabox.repo') }}</button>
                    <button type="button" class="a-btn" :disabled="loading" @click="refresh">{{ t('view.cimabox.check') }}</button>
                </div>
            </header>

            <section class="a-card">
                <div class="cb-row">
                    <div>
                        <div class="cb-label">{{ t('view.cimabox.installed') }}</div>
                        <div class="cb-value">{{ status.installed ? status.version : t('view.cimabox.not_installed') }}</div>
                    </div>
                    <div>
                        <div class="cb-label">{{ t('view.cimabox.latest') }}</div>
                        <div class="cb-value">{{ status.latest || '-' }}</div>
                    </div>
                    <div class="cb-state" :class="{ ok: upToDate, warn: updateAvailable }">
                        {{ stateText }}
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-2 mt-4">
                    <button v-if="!status.installed" type="button" class="a-btn primary" :disabled="busy" @click="install">
                        {{ busy ? t('view.cimabox.working') : t('view.cimabox.install') }}
                    </button>
                    <button v-else-if="updateAvailable" type="button" class="a-btn primary" :disabled="busy || status.running" @click="install">
                        {{ busy ? t('view.cimabox.working') : t('view.cimabox.update') }}
                    </button>
                    <button v-if="status.installed" type="button" class="a-btn" :disabled="busy" @click="launch">
                        {{ status.running ? t('view.cimabox.running') : t('view.cimabox.launch') }}
                    </button>
                    <button v-if="status.installed" type="button" class="a-btn" @click="openFolder">{{ t('view.cimabox.folder') }}</button>
                    <label class="flex items-center gap-2 ml-auto text-sm">
                        <Switch v-model="auto" />
                        {{ t('view.cimabox.auto') }}
                    </label>
                </div>
                <p v-if="message" class="a-note mt-3" :class="{ 'cb-bad': bad }">{{ message }}</p>
                <p v-if="status.running && updateAvailable" class="a-note mt-3">{{ t('view.cimabox.close_first') }}</p>
                <p class="a-note mt-3">{{ t('view.cimabox.source') }}</p>
            </section>

            <section v-if="status.notes" class="a-card">
                <h2 class="a-h2">{{ t('view.cimabox.whats_new') }}: {{ status.latest }}</h2>
                <pre class="cb-notes">{{ status.notes }}</pre>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref, watch } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { Switch } from '@/components/ui/switch';

    const { t } = useI18n();
    const REPO = 'https://github.com/Aye7even/CIMA-Box';
    const KEY = 'aurora.cimabox.auto';

    const status = ref({ installed: false });
    const loading = ref(false);
    const busy = ref(false);
    const message = ref('');
    const bad = ref(false);
    const auto = ref(readAuto());

    function readAuto() {
        try {
            return localStorage.getItem(KEY) === '1';
        } catch {
            return false;
        }
    }
    watch(auto, (v) => {
        try {
            localStorage.setItem(KEY, v ? '1' : '0');
        } catch {
            // light convenience only
        }
        if (v) maybeAuto();
    });

    function parts(v) {
        return String(v || '')
            .replace(/^v/i, '')
            .split('.')
            .map((n) => parseInt(n, 10) || 0);
    }
    function newer(a, b) {
        const x = parts(a);
        const y = parts(b);
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
            const d = (x[i] || 0) - (y[i] || 0);
            if (d) return d > 0;
        }
        return false;
    }

    const updateAvailable = computed(
        () => status.value.installed && !!status.value.latest && newer(status.value.latest, status.value.version)
    );
    const upToDate = computed(() => status.value.installed && !!status.value.latest && !updateAvailable.value);
    const stateText = computed(() => {
        if (!status.value.installed) return t('view.cimabox.not_installed');
        if (!status.value.latest) return t('view.cimabox.offline');
        return updateAvailable.value ? t('view.cimabox.update_ready') : t('view.cimabox.current');
    });

    async function refresh() {
        loading.value = true;
        try {
            status.value = JSON.parse(await AppApi.CimaBoxStatus());
            await maybeAuto();
        } catch (err) {
            console.error('cima box: status failed', err);
            message.value = t('view.cimabox.failed');
            bad.value = true;
        } finally {
            loading.value = false;
        }
    }

    async function install() {
        busy.value = true;
        message.value = '';
        bad.value = false;
        try {
            const res = JSON.parse(await AppApi.CimaBoxInstall());
            if (res.error === 'running') {
                message.value = t('view.cimabox.close_first');
                bad.value = true;
            } else if (res.error) {
                message.value = `${t('view.cimabox.failed')} ${res.error}`;
                bad.value = true;
            } else {
                message.value = t('view.cimabox.installed_ok', { v: res.version });
            }
            status.value = JSON.parse(await AppApi.CimaBoxStatus());
        } catch (err) {
            console.error('cima box: install failed', err);
            message.value = t('view.cimabox.failed');
            bad.value = true;
        } finally {
            busy.value = false;
        }
    }

    // keeps the program current by itself when it is not open
    async function maybeAuto() {
        if (!auto.value || busy.value) return;
        const s = status.value;
        if ((!s.installed || updateAvailable.value) && !s.running && s.latest) await install();
    }

    async function launch() {
        const res = JSON.parse(await AppApi.CimaBoxLaunch());
        if (res.error) {
            message.value = res.error;
            bad.value = true;
        } else {
            setTimeout(refresh, 1500);
        }
    }

    function openFolder() {
        AppApi.CimaBoxOpenFolder();
    }
    function openRepo() {
        AppApi.OpenLink(REPO);
    }

    onMounted(refresh);
</script>

<style scoped>
    .cb-row {
        display: flex;
        align-items: center;
        gap: 32px;
        flex-wrap: wrap;
    }
    .cb-label {
        font-size: 12px;
        opacity: 0.7;
    }
    .cb-value {
        font-size: 20px;
        font-weight: 600;
    }
    .cb-state {
        margin-left: auto;
        padding: 4px 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        font-size: 12px;
    }
    .cb-state.ok {
        border-color: #3ba55c;
    }
    .cb-state.warn {
        border-color: #e6a23c;
    }
    .cb-bad {
        color: #f56c6c;
    }
    .cb-notes {
        white-space: pre-wrap;
        font-family: inherit;
        font-size: 13px;
        margin-top: 10px;
        max-height: 360px;
        overflow: auto;
    }
</style>
