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

            <div v-else class="a-note warn">{{ t('view.friends_manager.suggest_note') }}</div>

            <section class="a-card">
                <h2 class="a-h2">
                    {{ tab === 'all' ? t('view.friends_manager.list') : t('view.friends_manager.tab_suggested') }}
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
                    <button v-if="selected.size" type="button" class="a-btn" @click="selected.clear()">
                        {{ t('view.friends_manager.clear') }}
                    </button>
                </div>

                <div v-if="!shown.length" class="a-empty">{{ t('view.friends_manager.empty') }}</div>

                <div v-for="x in visible" :key="x.row.id" class="a-row fm-row">
                    <input
                        type="checkbox"
                        class="fm-box"
                        :checked="selected.has(x.row.id)"
                        @change="toggle(x.row.id)" />
                    <button type="button" class="fm-who" @click="showUserDialog(x.row.id)">
                        <img v-if="x.row.photo" :src="x.row.photo" class="fm-avatar" loading="lazy" alt="" />
                        <span v-else class="a-initial">{{ x.row.name.slice(0, 1).toUpperCase() }}</span>
                        <span class="a-row-main">
                            <span class="a-row-title">{{ x.row.name }}</span>
                            <span class="a-row-meta">{{ meta(x.row) }}</span>
                        </span>
                    </button>
                    <span v-if="x.row.favorite" class="a-pill ok">{{ t('view.friends_manager.favorite') }}</span>
                    <span v-for="r in x.reasons" :key="r" class="a-pill warn">
                        {{ t('view.friends_manager.r_' + r) }}
                    </span>
                    <span v-if="tab === 'suggested'" class="a-pill bad">{{ x.score }}</span>
                    <button
                        type="button"
                        class="a-btn"
                        :disabled="busy"
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
    import { computed, onMounted, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { friendRequest } from '../../api';
    import { fmtDuration } from '../../services/auroraStats';
    import { handleFriendDelete } from '../../coordinators/friendRelationshipCoordinator';
    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { useFriendStore, useModalStore } from '../../stores';
    import {
        DAY,
        HANGOUT_BUCKETS,
        buildRows,
        filterRows,
        hangoutCounts,
        languageCounts,
        mutualBucket,
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
    const limit = ref(200);
    const loading = ref(false);
    const busy = ref(false);
    const selected = ref(new Set());
    const sorts = ['seen', 'seen_old', 'time', 'mutual', 'name'];
    const mutualKeys = ['none', 'few', 'some', 'many'];

    const now = ref(Date.now());

    const rows = computed(() =>
        buildRows([...friends.value.values()], {
            favorites: allFavoriteFriendIds.value || new Set(),
            now: now.value
        })
    );
    const hangouts = computed(() => hangoutCounts(rows.value, now.value));
    const languages = computed(() => languageCounts(rows.value));
    const mutualCounts = computed(() => {
        const out = {};
        for (const r of rows.value) {
            const k = mutualBucket(r);
            out[k] = (out[k] || 0) + 1;
        }
        return out;
    });
    const suggestions = computed(() => suggestUnfriend(rows.value, { now: now.value }));

    const shown = computed(() => {
        if (tab.value === 'suggested') return suggestions.value;
        return filterRows(rows.value, {
            search: search.value,
            hangout: hangout.value,
            language: language.value,
            mutual: mutual.value,
            sort: sort.value,
            now: now.value
        }).map((row) => ({ row, reasons: [], score: 0 }));
    });
    const visible = computed(() => shown.value.slice(0, limit.value));
    const allSelected = computed(() => shown.value.length > 0 && shown.value.every((x) => selected.value.has(x.row.id)));

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

    watch([search, sort, hangout, language, mutual, tab], () => {
        limit.value = 200;
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
        if (selected.value.has(id)) selected.value.delete(id);
        else selected.value.add(id);
        selected.value = new Set(selected.value);
    }

    function toggleAll() {
        selected.value = allSelected.value ? new Set() : new Set(shown.value.map((x) => x.row.id));
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
        modalStore
            .confirm({
                title: t('confirm.title'),
                description: t('view.friends_manager.confirm_one', { name: row.name })
            })
            .then(({ ok }) => ok && removeIds([row.id]))
            .catch(() => {});
    }

    function unfriendSelected() {
        const names = shown.value.filter((x) => selected.value.has(x.row.id)).map((x) => x.row.name);
        const ids = [...selected.value];
        if (!ids.length) return;
        modalStore
            .confirm({
                title: t('view.friends_manager.confirm_title', { n: ids.length }),
                description: t('view.friends_manager.confirm_many', { list: names.slice(0, 25).join('\n') })
            })
            .then(({ ok }) => ok && removeIds(ids))
            .catch(() => {});
    }

    onMounted(() => {
        now.value = Date.now();
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
    .fm-more {
        margin-top: 12px;
    }
</style>
