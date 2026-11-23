<template>
    <div class="fc">
        <section class="a-card fm-filters">
            <h2 class="a-h2">{{ t('view.friends_manager.ch_export_title') }}</h2>
            <span class="fm-label fm-wide">{{ t('view.friends_manager.ch_export_note') }}</span>
            <div class="fm-top">
                <div class="a-seg">
                    <button
                        v-for="r in ranges"
                        :key="r"
                        type="button"
                        :class="{ on: days === r }"
                        @click="days = r">
                        {{ r ? t('view.friends_manager.ch_days', { n: r }) : t('view.friends_manager.ch_all') }}
                    </button>
                </div>
                <button
                    type="button"
                    class="a-chip"
                    :class="{ on: types.includes('Unfriend') }"
                    @click="flip('Unfriend')">
                    {{ t('view.friends_manager.ch_unfriended') }}<small>{{ counts.Unfriend }}</small>
                </button>
                <button type="button" class="a-chip" :class="{ on: types.includes('Friend') }" @click="flip('Friend')">
                    {{ t('view.friends_manager.ch_added') }}<small>{{ counts.Friend }}</small>
                </button>
            </div>

            <div v-if="loading" class="a-empty">{{ t('view.friends_manager.loading') }}</div>
            <div v-else-if="!entries.length" class="a-empty">{{ t('view.friends_manager.ch_none') }}</div>
            <template v-else>
                <div class="fm-bar">
                    <label class="fm-check">
                        <input type="checkbox" :checked="allPicked" @change="toggleAll" />
                        {{ t('view.friends_manager.select_all') }}
                    </label>
                    <span class="a-pill">{{ t('view.friends_manager.selected', { n: pickedCount }) }}</span>
                    <button type="button" class="a-btn primary" :disabled="!pickedCount" @click="exportPicked">
                        {{ t('view.friends_manager.ch_export', { n: pickedCount }) }}
                    </button>
                </div>
                <div v-for="e in visible" :key="e.userId" class="a-row fm-row">
                    <input type="checkbox" class="fm-box" :checked="!off.has(e.userId)" @change="toggle(e.userId)" />
                    <span class="a-row-main">
                        <span class="a-row-title">{{ e.name }}</span>
                        <span class="a-row-meta">{{ when(e.at) }}</span>
                    </span>
                    <span class="a-pill" :class="e.type === 'Unfriend' ? 'bad' : 'ok'">
                        {{
                            t(e.type === 'Unfriend' ? 'view.friends_manager.ch_unfriended' : 'view.friends_manager.ch_added')
                        }}
                    </span>
                </div>
                <button v-if="visible.length < entries.length" type="button" class="a-btn fm-more" @click="limit += 200">
                    {{ t('view.friends_manager.more', { n: entries.length - visible.length }) }}
                </button>
            </template>
        </section>

        <section class="a-card fm-filters">
            <h2 class="a-h2">{{ t('view.friends_manager.ch_import_title') }}</h2>
            <span class="fm-label fm-wide">{{ t('view.friends_manager.ch_import_note') }}</span>
            <div class="fm-top">
                <label class="a-btn">
                    {{ t('view.friends_manager.ch_pick_file') }}
                    <input type="file" accept=".json,.txt,text/plain,application/json" hidden @change="onFile" />
                </label>
                <template v-if="imported">
                    <button
                        type="button"
                        class="a-chip"
                        :class="{ on: importTypes.includes('Unfriend') }"
                        @click="flipImport('Unfriend')">
                        {{ t('view.friends_manager.ch_unfriended') }}
                    </button>
                    <button
                        type="button"
                        class="a-chip"
                        :class="{ on: importTypes.includes('Friend') }"
                        @click="flipImport('Friend')">
                        {{ t('view.friends_manager.ch_added') }}
                    </button>
                </template>
            </div>
            <div v-if="imported && !imported.length" class="a-note warn">{{ t('view.friends_manager.ch_bad_file') }}</div>
            <template v-else-if="imported">
                <div class="fm-group">
                    <span class="a-pill ok">{{ t('view.friends_manager.names_found', { n: match.matched.length }) }}</span>
                    <span v-if="match.notFriends" class="a-pill">
                        {{ t('view.friends_manager.ch_not_friends', { n: match.notFriends }) }}
                    </span>
                    <span v-if="lockedCount" class="a-pill warn">
                        {{ t('view.friends_manager.ch_locked', { n: lockedCount }) }}
                    </span>
                </div>
                <div v-if="match.matched.length" class="fm-bar">
                    <label class="fm-check">
                        <input type="checkbox" :checked="allImportPicked" @change="toggleImportAll" />
                        {{ t('view.friends_manager.select_all') }}
                    </label>
                    <span class="a-pill">{{ t('view.friends_manager.selected', { n: importPickedCount }) }}</span>
                    <button
                        type="button"
                        class="a-btn danger"
                        :disabled="!importPickedCount || busy"
                        @click="emit('unfriend', importPicked)">
                        {{ t('view.friends_manager.unfriend_selected', { n: importPickedCount }) }}
                    </button>
                </div>
                <div v-for="r in match.matched.slice(0, 300)" :key="r.id" class="a-row fm-row">
                    <input
                        type="checkbox"
                        class="fm-box"
                        :checked="!importOff.has(r.id)"
                        :disabled="r.locked"
                        @change="toggleImport(r.id)" />
                    <span class="a-row-main">
                        <span class="a-row-title">{{ r.name }}</span>
                    </span>
                    <span v-if="r.locked" class="a-pill warn">{{ t('view.friends_manager.lock') }}</span>
                </div>
            </template>
        </section>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref, watch } from 'vue';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { database } from '../../services/database';
    import { changesFileText, matchChanges, parseChangesFile, recentChanges } from '../../services/friendInsights';

    const props = defineProps({
        rows: { type: Array, required: true },
        busy: { type: Boolean, default: false }
    });
    const emit = defineEmits(['unfriend']);
    const { t } = useI18n();

    const ranges = [7, 30, 90, 0];
    const days = ref(30);
    const types = ref(['Unfriend']);
    const loading = ref(true);
    const history = ref([]);
    const off = ref(new Set());
    const limit = ref(200);

    const entries = computed(() => recentChanges(history.value, { types: types.value, days: days.value }));
    const counts = computed(() => {
        const all = recentChanges(history.value, { days: days.value });
        return { Unfriend: all.filter((e) => e.type === 'Unfriend').length, Friend: all.filter((e) => e.type === 'Friend').length };
    });
    const visible = computed(() => entries.value.slice(0, limit.value));
    const pickedCount = computed(() => entries.value.filter((e) => !off.value.has(e.userId)).length);
    const allPicked = computed(() => entries.value.length > 0 && pickedCount.value === entries.value.length);

    watch([days, types], () => {
        limit.value = 200;
    });

    function flip(type) {
        types.value = types.value.includes(type) ? types.value.filter((x) => x !== type) : [...types.value, type];
    }
    function toggle(id) {
        if (off.value.has(id)) off.value.delete(id);
        else off.value.add(id);
        off.value = new Set(off.value);
    }
    function toggleAll() {
        off.value = allPicked.value ? new Set(entries.value.map((e) => e.userId)) : new Set();
    }
    function when(at) {
        return at ? new Date(at).toLocaleString() : '';
    }

    function exportPicked() {
        const list = entries.value.filter((e) => !off.value.has(e.userId));
        if (!list.length) return;
        const blob = new Blob([changesFileText(list)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `aurora-friend-changes-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast.success(t('view.friends_manager.ch_exported', { n: list.length }));
    }

    // importing a file from a friend
    const imported = ref(null);
    const importTypes = ref(['Unfriend']);
    const importOff = ref(new Set());

    const match = computed(() =>
        imported.value ? matchChanges(props.rows, imported.value, importTypes.value) : { matched: [], notFriends: 0 }
    );
    const lockedCount = computed(() => match.value.matched.filter((r) => r.locked).length);
    const pickable = computed(() => match.value.matched.filter((r) => !r.locked));
    const importPicked = computed(() => pickable.value.filter((r) => !importOff.value.has(r.id)).map((r) => r.id));
    const importPickedCount = computed(() => importPicked.value.length);
    const allImportPicked = computed(() => pickable.value.length > 0 && importPickedCount.value === pickable.value.length);

    function flipImport(type) {
        importTypes.value = importTypes.value.includes(type)
            ? importTypes.value.filter((x) => x !== type)
            : [...importTypes.value, type];
        importOff.value = new Set();
    }
    function toggleImport(id) {
        if (importOff.value.has(id)) importOff.value.delete(id);
        else importOff.value.add(id);
        importOff.value = new Set(importOff.value);
    }
    function toggleImportAll() {
        importOff.value = allImportPicked.value ? new Set(pickable.value.map((r) => r.id)) : new Set();
    }

    async function onFile(ev) {
        const file = ev.target.files?.[0];
        ev.target.value = '';
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            imported.value = [];
            return;
        }
        imported.value = parseChangesFile(await file.text());
        importOff.value = new Set();
    }

    onMounted(async () => {
        try {
            history.value = await database.getFriendLogHistory();
        } catch (err) {
            console.error(err);
        } finally {
            loading.value = false;
        }
    });
</script>

<style scoped>
    .fm-filters {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .fm-top {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
    }
    .fm-search {
        flex: 1;
        min-width: 180px;
        padding: 7px 12px;
        border-radius: 10px;
        border: 1px solid var(--a-line);
        background: transparent;
        color: var(--foreground);
        font-size: 0.86rem;
    }
    .fm-group {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
    }
    .fm-label {
        width: 92px;
        flex: none;
        font-size: 0.75rem;
        color: var(--a-muted);
    }
    .fm-wide {
        width: auto;
    }
    .fm-bar {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
        padding-bottom: 10px;
    }
    .fm-check {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 0.82rem;
        margin-right: auto;
    }
    .fm-row {
        gap: 10px;
    }
    .fm-who {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
    }
    .fm-avatar {
        flex: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
    }
    .fm-names {
        width: 100%;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid var(--a-line);
        background: transparent;
        color: var(--foreground);
        font-size: 0.86rem;
        resize: vertical;
    }
    .fm-more {
        margin-top: 12px;
    }
    .fc {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
</style>
