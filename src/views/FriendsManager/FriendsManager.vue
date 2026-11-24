<template>
    <div class="a-page">
        <div class="a-page-inner">
            <header class="a-head">
                <div>
                    <h1 class="a-title">{{ t('view.friends_manager.title') }}</h1>
                    <p class="a-sub">{{ t('view.friends_manager.sub') }}</p>
                </div>
                <div class="a-seg">
                    <button type="button" :class="{ on: tab === 'all' }" @click="tab = 'all'">
                        {{ t('view.friends_manager.tab_all') }}
                    </button>
                    <button type="button" :class="{ on: tab === 'suggested' }" @click="tab = 'suggested'">
                        {{ t('view.friends_manager.tab_suggested') }}
                        <small>{{ suggestions.length }}</small>
                    </button>
                    <button type="button" :class="{ on: tab === 'organize' }" @click="tab = 'organize'">
                        {{ t('view.friends_manager.tab_organize') }}
                    </button>
                    <button type="button" :class="{ on: tab === 'changes' }" @click="tab = 'changes'">
                        {{ t('view.friends_manager.tab_changes') }}
                    </button>
                    <button type="button" :class="{ on: tab === 'review' }" @click="tab = 'review'">
                        {{ t('view.friends_manager.tab_review') }}
                    </button>
                    <button type="button" :class="{ on: tab === 'groups' }" @click="tab = 'groups'">
                        {{ t('view.friends_manager.tab_groups') }}
                    </button>
                    <button type="button" :class="{ on: tab === 'alerts' }" @click="tab = 'alerts'">
                        {{ t('view.friends_manager.tab_alerts') }}
                    </button>
                    <button type="button" :class="{ on: tab === 'names' }" @click="tab = 'names'">
                        {{ t('view.friends_manager.tab_names') }}
                    </button>
                </div>
            </header>

            <div class="a-grid a-grid-4">
                <div v-for="s in tiles" :key="s.label" class="a-card a-stat">
                    <span class="a-stat-label">{{ s.label }}</span>
                    <span class="a-stat-value">{{ s.value }}</span>
                    <span class="a-stat-sub">{{ s.sub }}</span>
                </div>
            </div>

            <div v-if="loading" class="a-note">{{ t('view.friends_manager.loading') }}</div>

            <section v-if="tab === 'all'" class="a-card fm-filters">
                <div class="fm-top">
                    <input
                        v-model="search"
                        class="fm-search"
                        type="search"
                        :placeholder="t('view.friends_manager.search')" />
                    <div class="a-seg">
                        <button
                            v-for="s in sorts"
                            :key="s"
                            type="button"
                            :class="{ on: sort === s }"
                            @click="sort = s">
                            {{ t('view.friends_manager.sort_' + s) }}
                        </button>
                    </div>
                </div>

                <div class="fm-group">
                    <span class="fm-label">{{ t('view.friends_manager.f_hangout') }}</span>
                    <button type="button" class="a-chip" :class="{ on: hangout === 'all' }" @click="hangout = 'all'">
                        {{ t('view.friends_manager.any') }}
                    </button>
                    <button
                        v-for="b in HANGOUT_BUCKETS"
                        :key="b.key"
                        type="button"
                        class="a-chip"
                        :class="{ on: hangout === b.key }"
                        @click="hangout = b.key">
                        {{ t('view.friends_manager.h_' + b.key) }}<small>{{ hangouts[b.key] }}</small>
                    </button>
                </div>

                <div class="fm-group">
                    <span class="fm-label">{{ t('view.friends_manager.f_language') }}</span>
                    <button type="button" class="a-chip" :class="{ on: language === 'all' }" @click="language = 'all'">
                        {{ t('view.friends_manager.any') }}
                    </button>
                    <button
                        v-for="l in languages"
                        :key="l.key"
                        type="button"
                        class="a-chip"
                        :class="{ on: language === l.key }"
                        @click="language = l.key">
                        {{ langName(l.key) }}<small>{{ l.count }}</small>
                    </button>
                </div>

                <div v-for="g in extraGroups" :key="g.key" class="fm-group">
                    <span class="fm-label">{{ g.label }}</span>
                    <button
                        type="button"
                        class="a-chip"
                        :class="{ on: extra[g.key] === 'all' }"
                        @click="extra[g.key] = 'all'">
                        {{ t('view.friends_manager.any') }}
                    </button>
                    <button
                        v-for="o in g.options"
                        :key="o.key"
                        type="button"
                        class="a-chip"
                        :class="{ on: extra[g.key] === o.key }"
                        @click="extra[g.key] = o.key">
                        {{ o.label }}<small>{{ o.count }}</small>
                    </button>
                </div>

                <div class="fm-group">
                    <span class="fm-label">{{ t('view.friends_manager.f_mutual') }}</span>
                    <button type="button" class="a-chip" :class="{ on: mutual === 'all' }" @click="mutual = 'all'">
                        {{ t('view.friends_manager.any') }}
                    </button>
                    <button
                        v-for="m in mutualKeys"
                        :key="m"
                        type="button"
                        class="a-chip"
                        :class="{ on: mutual === m }"
                        @click="mutual = m">
                        {{ t('view.friends_manager.m_' + m) }}<small>{{ mutualCounts[m] || 0 }}</small>
                    </button>
                </div>
            </section>

            <section v-else-if="tab === 'names'" class="a-card fm-filters">
                <span class="fm-label">{{ t('view.friends_manager.names_label') }}</span>
                <textarea
                    v-model="namesText"
                    class="fm-names"
                    rows="3"
                    :placeholder="t('view.friends_manager.names_placeholder')"></textarea>
                <div v-if="namesText.trim()" class="fm-group">
                    <span class="a-pill ok">{{ t('view.friends_manager.names_found', { n: nameMatch.matched.length }) }}</span>
                    <span v-if="nameMatch.missing.length" class="a-pill warn">
                        {{ t('view.friends_manager.names_missing', { list: nameMatch.missing.join(', ') }) }}
                    </span>
                    <span v-if="nameMatch.skippedLocked.length" class="a-pill">
                        {{ t('view.friends_manager.names_locked', { list: nameMatch.skippedLocked.join(', ') }) }}
                    </span>
                    <span v-if="nameMatch.ambiguous.length" class="a-pill bad">
                        {{ t('view.friends_manager.names_ambiguous', { list: nameMatch.ambiguous.join(', ') }) }}
                    </span>
                </div>
            </section>

            <section v-else-if="tab === 'organize'" class="a-card fm-filters">
                <div class="fm-top">
                    <div class="a-seg">
                        <button
                            v-for="b in buckets"
                            :key="b"
                            type="button"
                            :class="{ on: bucket === b }"
                            @click="bucket = b">
                            {{ t('view.friends_manager.b_' + b) }}
                            <small>{{ organized[b].length }}</small>
                        </button>
                    </div>
                </div>
                <span class="fm-label fm-wide">{{ t('view.friends_manager.organize_note') }}</span>
            </section>

            <div v-else-if="tab === 'suggested'" class="a-note warn">{{ t('view.friends_manager.suggest_note') }}</div>

            <FriendAlerts v-if="tab === 'alerts'" :rows="rows" />
            <FriendReview v-if="tab === 'review'" :rows="rows" :busy="busy" @unfriend="confirmUnfriendIds" />
            <GroupsManager v-if="tab === 'groups'" />
            <FriendChanges v-if="tab === 'changes'" :rows="rows" :busy="busy" @unfriend="confirmUnfriendIds" />

            <section v-else-if="!['alerts', 'review', 'groups'].includes(tab)" class="a-card">
                <h2 class="a-h2">
                    {{ listTitle }}
                    <span class="a-h2-aside">{{ shown.length }}</span>
                </h2>

                <div v-if="shown.length" class="fm-bar">
                    <label class="fm-check">
                        <input type="checkbox" :checked="allSelected" @change="toggleAll" />
                        {{ t('view.friends_manager.select_all') }}
                    </label>
                    <span v-if="selected.size" class="a-pill">
                        {{ t('view.friends_manager.selected', { n: selected.size }) }}
                    </span>
                    <button
                        v-if="selected.size"
                        type="button"
                        class="a-btn danger"
                        :disabled="busy"
                        @click="unfriendSelected">
                        {{ t('view.friends_manager.unfriend_selected', { n: selected.size }) }}
                    </button>
                    <button v-if="selected.size" type="button" class="a-btn" @click="lockSelected">
                        {{ t('view.friends_manager.lock_selected', { n: selected.size }) }}
                    </button>
                    <button v-if="selected.size" type="button" class="a-btn" @click="selected = new Set()">
                        {{ t('view.friends_manager.clear') }}
                    </button>
                    <button type="button" class="a-btn" @click="exportFile">
                        {{ selected.size ? t('view.friends_manager.export_selected') : t('view.friends_manager.export') }}
                    </button>
                </div>

                <div v-if="!shown.length" class="a-empty">{{ t('view.friends_manager.empty') }}</div>

                <div v-for="x in visible" :key="x.row.id" class="a-row fm-row">
                    <input
                        type="checkbox"
                        class="fm-box"
                        :checked="selected.has(x.row.id)"
                        :disabled="x.row.locked"
                        @change="toggle(x.row.id)" />
                    <button type="button" class="fm-who" @click="showUserDialog(x.row.id)">
                        <img v-if="x.row.photo" :src="x.row.photo" class="fm-avatar" loading="lazy" alt="" />
                        <span v-else class="a-initial">{{ x.row.name.slice(0, 1).toUpperCase() }}</span>
                        <span class="a-row-main">
                            <span class="a-row-title">{{ x.row.name }}</span>
                            <span class="a-row-meta">{{ meta(x.row) }}</span>
                        </span>
                    </button>
                    <span v-if="x.row.locked" class="a-pill ok">{{ t('view.friends_manager.locked') }}</span>
                    <span v-if="x.row.favorite" class="a-pill ok">{{ t('view.friends_manager.favorite') }}</span>
                    <span v-for="r in x.reasons" :key="r" class="a-pill warn">
                        {{ t('view.friends_manager.r_' + r) }}
                    </span>
                    <span v-if="tab === 'suggested' || tab === 'organize'" class="a-pill bad">{{ x.score }}</span>
                    <button
                        type="button"
                        class="a-btn"
                        :title="t(x.row.locked ? 'view.friends_manager.unlock' : 'view.friends_manager.lock')"
                        @click="setLocked(x.row.id, !x.row.locked)">
                        {{ t(x.row.locked ? 'view.friends_manager.unlock' : 'view.friends_manager.lock') }}
                    </button>
                    <button
                        type="button"
                        class="a-btn"
                        :disabled="busy || x.row.locked"
                        :title="t('view.friends_manager.unfriend')"
                        @click="unfriendOne(x.row)">
                        {{ t('view.friends_manager.unfriend') }}
                    </button>
                </div>

                <button v-if="visible.length < shown.length" type="button" class="a-btn fm-more" @click="limit += 200">
                    {{ t('view.friends_manager.more', { n: shown.length - visible.length }) }}
                </button>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, reactive, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import FriendAlerts from './FriendAlerts.vue';
    import FriendChanges from './FriendChanges.vue';
    import FriendReview from './FriendReview.vue';
    import GroupsManager from './GroupsManager.vue';
    import { friendRequest } from '../../api';
    import { fmtDuration } from '../../services/auroraStats';
    import { initDecisions } from '../../services/decisionNotes';
    import { initFriendLocks, lockedIds, setLocked, setManyLocked } from '../../services/friendLocks';
    import { handleFriendDelete } from '../../coordinators/friendRelationshipCoordinator';
    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { useFriendStore, useModalStore } from '../../stores';
    import {
        DAY,
        HANGOUT_BUCKETS,
        buildRows,
        filterRows,
        countBy,
        hangoutCounts,
        languageCounts,
        exportText,
        matchNames,
        mutualBucket,
        organizeFriends,
        suggestUnfriend
    } from '../../services/friendInsights';

    const { t } = useI18n();
    const friendStore = useFriendStore();
    const modalStore = useModalStore();
    const { friends, allFavoriteFriendIds } = storeToRefs(friendStore);

    const tab = ref('all');
    const search = ref('');
    const sort = ref('seen');
    const hangout = ref('all');
    const language = ref('all');
    const mutual = ref('all');
    const extra = reactive({ age: 'all', trust: 'all', status: 'all', platform: 'all', mark: 'all' });
    const limit = ref(200);
    const loading = ref(false);
    const busy = ref(false);
    const selected = ref(new Set());
    const sorts = ['seen', 'seen_old', 'time', 'mutual', 'name'];
    const mutualKeys = ['none', 'few', 'some', 'many'];
    const buckets = ['cut', 'maybe', 'keep'];
    const bucket = ref('cut');

    const now = ref(Date.now());

    const rows = computed(() =>
        buildRows([...friends.value.values()], {
            favorites: allFavoriteFriendIds.value || new Set(),
            locked: lockedIds.value,
            now: now.value
        })
    );
    const hangouts = computed(() => hangoutCounts(rows.value, now.value));
    const languages = computed(() => languageCounts(rows.value));
    const extraGroups = computed(() => {
        const label = (ns, k) => t('view.friends_manager.' + ns + String(k).replace(/ /g, '_'));
        const opts = (key, name) =>
            countBy(rows.value, key).map((o) => ({ key: o.key, label: name(o.key), count: o.count }));
        const known = (ns) => (k) => (k === 'none' ? t('view.friends_manager.unknown') : label(ns, k));
        const groups = [
            { key: 'age', label: t('view.friends_manager.f_age'), options: opts('age', (k) => label('age_', k)) },
            { key: 'trust', label: t('view.friends_manager.f_trust'), options: opts('trustName', (k) => (k === 'none' ? t('view.friends_manager.unknown') : k)) },
            { key: 'status', label: t('view.friends_manager.f_status'), options: opts('presence', known('st_')) },
            { key: 'platform', label: t('view.friends_manager.f_platform'), options: opts('platform', known('pl_')) },
            {
                key: 'mark',
                label: t('view.friends_manager.f_mark'),
                options: ['favorite', 'notfavorite', 'memo', 'nomemo', 'locked'].map((k) => ({
                    key: k,
                    label: label('mk_', k),
                    count: rows.value.filter((r) =>
                        k === 'favorite' ? r.favorite : k === 'notfavorite' ? !r.favorite : k === 'memo' ? r.hasMemo : k === 'nomemo' ? !r.hasMemo : r.locked
                    ).length
                }))
            }
        ];
        // an option that is the same for everyone filters nothing, so only groups with a choice show
        return groups.filter((g) => g.key === 'mark' || g.options.length > 1);
    });
    const mutualCounts = computed(() => {
        const out = {};
        for (const r of rows.value) {
            const k = mutualBucket(r);
            out[k] = (out[k] || 0) + 1;
        }
        return out;
    });
    const suggestions = computed(() => suggestUnfriend(rows.value, { now: now.value }));
    const organized = computed(() => organizeFriends(rows.value, { now: now.value }));

    const namesText = ref('');
    const nameMatch = computed(() => matchNames(rows.value, namesText.value));
    const listTitle = computed(() =>
        t(
            tab.value === 'all'
                ? 'view.friends_manager.list'
                : tab.value === 'names'
                  ? 'view.friends_manager.tab_names'
                  : tab.value === 'organize'
                    ? 'view.friends_manager.tab_organize'
                    : 'view.friends_manager.tab_suggested'
        )
    );

    const shown = computed(() => {
        if (tab.value === 'suggested') return suggestions.value;
        if (tab.value === 'organize') return organized.value[bucket.value];
        if (tab.value === 'names') return nameMatch.value.matched.map((row) => ({ row, reasons: [], score: 0 }));
        return filterRows(rows.value, {
            search: search.value,
            hangout: hangout.value,
            language: language.value,
            mutual: mutual.value,
            age: extra.age,
            trust: extra.trust,
            status: extra.status,
            platform: extra.platform,
            mark: extra.mark,
            sort: sort.value,
            now: now.value
        }).map((row) => ({ row, reasons: [], score: 0 }));
    });
    const visible = computed(() => shown.value.slice(0, limit.value));
    const selectable = computed(() => shown.value.filter((x) => !x.row.locked));
    const allSelected = computed(
        () => selectable.value.length > 0 && selectable.value.every((x) => selected.value.has(x.row.id))
    );

    const tiles = computed(() => {
        const total = rows.value.length;
        const month = hangouts.value.week + hangouts.value.month;
        const quiet = hangouts.value.half + hangouts.value.year + hangouts.value.old;
        const known = rows.value.filter((r) => r.mutual !== null);
        const avg = known.length ? Math.round(known.reduce((s, r) => s + r.mutual, 0) / known.length) : 0;
        return [
            {
                label: t('view.friends_manager.t_total'),
                value: total,
                sub: t('view.friends_manager.t_total_sub', { n: rows.value.filter((r) => r.favorite).length })
            },
            {
                label: t('view.friends_manager.t_active'),
                value: month,
                sub: t('view.friends_manager.t_active_sub')
            },
            {
                label: t('view.friends_manager.t_quiet'),
                value: quiet,
                sub: t('view.friends_manager.t_quiet_sub')
            },
            {
                label: t('view.friends_manager.t_avg'),
                value: avg,
                sub: t('view.friends_manager.t_avg_sub')
            }
        ];
    });

    watch([search, sort, hangout, language, mutual, tab, bucket, () => ({ ...extra })], () => {
        limit.value = 200;
    });

    // typing a list selects everyone it matches, so one click on Unfriend finishes the job
    watch(nameMatch, (m) => {
        if (tab.value === 'names') selected.value = new Set(m.matched.map((r) => r.id));
    });

    function langName(key) {
        if (key === 'none') return t('view.friends_manager.no_language');
        try {
            return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(key) || key;
        } catch {
            return key;
        }
    }

    function ago(row) {
        if (row.daysAway === null) return t('view.friends_manager.never');
        if (row.daysAway < 1) return t('view.friends_manager.today');
        if (row.daysAway < 60) return t('view.friends_manager.days_ago', { n: row.daysAway });
        if (row.daysAway < 730) return t('view.friends_manager.months_ago', { n: Math.round(row.daysAway / 30) });
        return t('view.friends_manager.years_ago', { n: Math.round(row.daysAway / 365) });
    }

    function meta(row) {
        const parts = [t('view.friends_manager.seen', { when: ago(row) })];
        if (row.timeSpent) parts.push(t('view.friends_manager.together', { time: fmtDuration(row.timeSpent) }));
        if (row.mutual !== null) parts.push(t('view.friends_manager.mutuals', { n: row.mutual }));
        if (row.languages.length) parts.push(row.languages.map(langName).join(', '));
        return parts.join('  -  ');
    }

    function toggle(id) {
        if (lockedIds.value.has(id)) return;
        if (selected.value.has(id)) selected.value.delete(id);
        else selected.value.add(id);
        selected.value = new Set(selected.value);
    }

    function toggleAll() {
        selected.value = allSelected.value ? new Set() : new Set(selectable.value.map((x) => x.row.id));
    }

    function lockSelected() {
        const ids = [...selected.value];
        setManyLocked(ids, true);
        selected.value = new Set();
        toast.success(t('view.friends_manager.locked_n', { n: ids.length }));
    }

    async function load() {
        loading.value = true;
        try {
            await Promise.allSettled([
                friendStore.getAllUserStats(),
                friendStore.getAllUserMutualCount(),
                friendStore.getAllUserMutualOptedOut()
            ]);
        } finally {
            now.value = Date.now();
            loading.value = false;
        }
    }

    async function removeIds(ids) {
        ids = ids.filter((id) => !lockedIds.value.has(id));
        if (!ids.length) return;
        busy.value = true;
        let done = 0;
        try {
            for (const userId of ids) {
                const args = await friendRequest.deleteFriend({ userId });
                handleFriendDelete(args);
                selected.value.delete(userId);
                done++;
            }
        } catch (err) {
            console.error(err);
            toast.error(t('view.friends_manager.failed'));
        } finally {
            selected.value = new Set(selected.value);
            busy.value = false;
        }
        if (done) toast.success(t('view.friends_manager.done', { n: done }));
    }

    function unfriendOne(row) {
        if (row.locked) return;
        modalStore
            .confirm({
                title: t('confirm.title'),
                description: t('view.friends_manager.confirm_one', { name: row.name })
            })
            .then(({ ok }) => ok && removeIds([row.id]))
            .catch(() => {});
    }

    function unfriendSelected() {
        confirmUnfriendIds([...selected.value]);
    }

    function confirmUnfriendIds(all) {
        const ids = all.filter((id) => !lockedIds.value.has(id));
        const names = rows.value.filter((r) => ids.includes(r.id)).map((r) => r.name);
        if (!ids.length) return;
        modalStore
            .confirm({
                title: t('view.friends_manager.confirm_title', { n: ids.length }),
                description: t('view.friends_manager.confirm_many', { list: names.slice(0, 25).join('\n') })
            })
            .then(({ ok }) => ok && removeIds(ids))
            .catch(() => {});
    }

    function exportFile() {
        const list = selected.value.size
            ? rows.value.filter((r) => selected.value.has(r.id))
            : shown.value.map((x) => x.row);
        if (!list.length) return;
        const blob = new Blob([exportText(list)], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `aurora-friends-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast.success(t('view.friends_manager.exported', { n: list.length }));
    }

    onMounted(() => {
        now.value = Date.now();
        initFriendLocks();
        initDecisions();
        load();
    });

    // Keep DAY referenced for readers: buckets are measured in days.
    void DAY;
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
</style>
