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

            <div class="a-grid a-grid-3">
                <div class="a-card a-stat">
                    <span class="a-stat-label">{{ t('view.cimabox.installed') }}</span>
                    <span class="a-stat-value">{{ status.installed ? status.version : '-' }}</span>
                    <span class="a-stat-sub">{{ status.installed ? t('view.cimabox.current_sub') : t('view.cimabox.not_installed') }}</span>
                </div>
                <div class="a-card a-stat">
                    <span class="a-stat-label">{{ t('view.cimabox.latest') }}</span>
                    <span class="a-stat-value">{{ status.latest || '-' }}</span>
                    <span class="a-stat-sub">{{ status.published ? status.published.slice(0, 10) : '' }}</span>
                </div>
                <div class="a-card a-stat">
                    <span class="a-stat-label">{{ t('view.cimabox.status') }}</span>
                    <span class="a-stat-value cb-state" :class="{ ok: upToDate, warn: updateAvailable }">{{ stateText }}</span>
                    <span class="a-stat-sub">{{ status.running ? t('view.cimabox.running') : '' }}</span>
                </div>
            </div>

            <section class="a-card">
                <h2 class="a-h2">{{ t('view.cimabox.manage') }}</h2>
                <div class="flex flex-wrap items-center gap-2">
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
                </div>
                <label class="a-switch cb-auto">
                    <input v-model="auto" type="checkbox" />
                    <span class="a-switch-track"><span class="a-switch-knob"></span></span>
                    <span>{{ t('view.cimabox.auto') }}</span>
                </label>
                <p v-if="message" class="a-note" :class="{ warn: bad }">{{ message }}</p>
                <p v-if="status.running && updateAvailable" class="a-note warn">{{ t('view.cimabox.close_first') }}</p>
                <p class="a-note">{{ t('view.cimabox.source') }}</p>
            </section>

            <section v-if="status.notes" class="a-card">
                <h2 class="a-h2">{{ t('view.cimabox.whats_new') }} <span class="a-pill">{{ status.latest }}</span></h2>
                <pre class="cb-notes">{{ status.notes }}</pre>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref, watch } from 'vue';
    import { useI18n } from 'vue-i18n';

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
    .cb-state {
        font-size: 1.1rem;
    }
    .cb-state.ok {
        color: var(--a-accent);
    }
    .cb-auto {
        margin-top: 16px;
    }
    .cb-notes {
        white-space: pre-wrap;
        font-family: inherit;
        font-size: 0.82rem;
        color: var(--a-muted);
        max-height: 360px;
        overflow: auto;
    }
</style>
