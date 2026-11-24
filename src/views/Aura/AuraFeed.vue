<template>
    <div class="au-page">
        <section class="au-left">
            <div class="aura-label">LOG</div>
            <h1 class="au-big au-mid">{{ t('aura.feed.title') }}</h1>
            <div class="au-tabs">
                <button
                    v-for="f in FILTERS"
                    :key="f"
                    type="button"
                    :class="{ on: filter === f }"
                    @click="filter = f">
                    {{ t(`aura.feed.f_${f}`) }}
                </button>
            </div>

            <div v-if="!groups.length" class="au-empty">{{ t('aura.feed.empty') }}</div>
            <template v-for="g in groups" :key="g.label">
                <div class="aura-label au-gap">{{ g.label }}</div>
                <div v-for="r in g.rows" :key="r.rowId ?? r.created_at + r.userId + r.type" class="au-line">
                    <div class="au-time">{{ r.time }}</div>
                    <div class="au-grow">
                        <button type="button" class="au-name" @click="showUserDialog(r.userId)">
                            {{ r.displayName }}
                        </button>
                        <span class="au-meta"> {{ r.verb }}</span>
                    </div>
                    <div class="au-meta">{{ r.where }}</div>
                </div>
            </template>
        </section>

        <AuraStage kanji="記録" :size="300" offset="12%" variant="b">
            <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" fill="none">
                <line x1="300" y1="80" x2="300" y2="720" class="s-dash" />
                <path d="M60 700 C120 520 330 560 300 380 S120 240 220 120" class="s-line" />
                <circle cx="300" cy="380" r="3.2" class="s-node" />
                <circle cx="220" cy="120" r="3.2" class="s-node" />
                <circle cx="60" cy="700" r="3.2" class="s-node" />
            </svg>
        </AuraStage>
    </div>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import AuraStage from '../../components/AuraStage.vue';
    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { useFeedStore } from '../../stores';

    const { t } = useI18n();
    const { feedTableData } = storeToRefs(useFeedStore());
    const FILTERS = ['all', 'moves', 'status', 'profile'];
    const filter = ref('all');

    const GROUP = { moves: ['GPS'], status: ['Online', 'Offline', 'Status'], profile: ['Bio', 'Avatar'] };
    const VERB = { Online: 'online', Offline: 'offline', GPS: 'moved', Status: 'status', Bio: 'bio', Avatar: 'avatar' };

    const dayLabel = (d) => {
        const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const diff = Math.round((start(new Date()) - start(d)) / 86400000);
        if (diff === 0) return t('aura.feed.today').toUpperCase();
        if (diff === 1) return t('aura.feed.yesterday').toUpperCase();
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
    };

    const groups = computed(() => {
        const allow = GROUP[filter.value];
        const out = [];
        let cur = null;
        let n = 0;
        for (const r of feedTableData.value) {
            if (allow && !allow.includes(r.type)) continue;
            if (++n > 200) break;
            const d = new Date(r.created_at);
            if (Number.isNaN(d.getTime())) continue;
            const label = dayLabel(d);
            if (!cur || cur.label !== label) out.push((cur = { label, rows: [] }));
            const status = r.status ? ` · ${r.status}` : '';
            cur.rows.push({
                ...r,
                time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
                verb: t(`aura.feed.v_${VERB[r.type] || 'status'}`) + status,
                where: r.type === 'GPS' ? r.worldName || '' : ''
            });
        }
        return out;
    });
</script>
