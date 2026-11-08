<template>
    <div class="a-page">
        <div class="a-page-inner">
            <header class="a-head">
                <div>
                    <h1 class="a-title">{{ t('view.insights.title') }}</h1>
                    <p class="a-sub">{{ t('view.insights.sub') }}</p>
                </div>
                <div class="a-seg">
                    <button
                        v-for="r in ranges"
                        :key="r.days"
                        type="button"
                        :class="{ on: range === r.days }"
                        @click="range = r.days">
                        {{ r.label }}
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

            <section class="a-card">
                <h2 class="a-h2">
                    {{ t('view.insights.playtime') }}
                    <span class="a-h2-aside">{{ t('view.insights.per_day') }}</span>
                </h2>
                <AChart :option="playtimeOption" :height="220" />
            </section>

            <div class="a-grid a-grid-2 items-start">
                <section class="a-card">
                    <h2 class="a-h2">{{ t('view.insights.rhythm') }}</h2>
                    <AChart :option="heatOption" :height="236" />
                </section>
                <section class="a-card">
                    <h2 class="a-h2">{{ t('view.insights.together') }}</h2>
                    <p v-if="!data.topFriends.length" class="a-empty">{{ t('view.insights.nobody') }}</p>
                    <button
                        v-for="(f, i) in data.topFriends"
                        :key="f.id"
                        type="button"
                        class="ins-bar"
                        @click="showUserDialog(f.id)">
                        <span class="ins-bar-rank">{{ i + 1 }}</span>
                        <span class="ins-bar-main">
                            <span class="ins-bar-top">
                                <span class="ins-bar-name">{{ f.name }}</span>
                                <span class="ins-bar-value">{{ fmtDuration(f.time) }}</span>
                            </span>
                            <span class="ins-bar-track"><i :style="{ width: barWidth(f.time) }"></i></span>
                        </span>
                    </button>
                </section>
            </div>

            <div class="a-grid a-grid-2">
                <section class="a-card">
                    <h2 class="a-h2">{{ t('view.insights.online_hours') }}</h2>
                    <AChart :option="onlineOption" :height="200" />
                </section>
                <section class="a-card">
                    <h2 class="a-h2">{{ t('view.insights.friend_growth') }}</h2>
                    <AChart :option="growthOption" :height="200" />
                </section>
            </div>

            <div class="a-grid a-grid-2">
                <section class="a-card">
                    <h2 class="a-h2">{{ t('view.insights.worlds') }}</h2>
                    <div class="ins-donut">
                        <AChart :option="worldsOption" :height="170" @select="openWorld" />
                        <div class="ins-legend">
                            <button
                                v-for="(w, i) in data.topWorlds.slice(0, 6)"
                                :key="w.id"
                                type="button"
                                class="ins-legend-row"
                                @click="showWorldDialog(w.id)">
                                <i :style="{ background: palette[i % palette.length] }"></i>
                                <span class="ins-legend-name">{{ w.name }}</span>
                                <span class="ins-legend-value">{{ fmtDuration(w.time) }}</span>
                            </button>
                            <p v-if="!data.topWorlds.length" class="a-empty">{{ t('view.insights.no_worlds') }}</p>
                        </div>
                    </div>
                </section>
                <section class="a-card">
                    <h2 class="a-h2">{{ t('view.insights.met') }}</h2>
                    <AChart :option="metOption" :height="210" />
                </section>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AChart from './AChart.vue';
    import { fmtDuration } from '../../services/auroraStats';
    import { loadInsights } from '../../services/auroraInsights';
    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { showWorldDialog } from '../../coordinators/worldCoordinator';
    import { useFriendStore } from '../../stores';

    const { t } = useI18n();
    const friendStore = useFriendStore();

    const range = ref(30);
    const ranges = computed(() => [
        { days: 7, label: t('view.insights.r7') },
        { days: 30, label: t('view.insights.r30') },
        { days: 90, label: t('view.insights.r90') },
        { days: 0, label: t('view.insights.rall') }
    ]);

    const data = ref({
        total: 0,
        longest: 0,
        sessions: 0,
        days: [],
        perDay: [],
        heat: Array.from({ length: 7 }, () => new Array(24).fill(0)),
        topWorlds: [],
        worldCount: 0,
        topFriends: [],
        peopleMet: [],
        uniquePeople: 0,
        onlineByHour: new Array(24).fill(0),
        growth: []
    });

    async function refresh() {
        try {
            const friends = friendStore.friends;
            data.value = await loadInsights({
                rangeDays: range.value,
                friendIds: new Set(friends ? friends.keys() : []),
                friendCount: friends ? friends.size : 0
            });
        } catch (e) {
            console.error('Insights', e);
        }
    }
    onMounted(refresh);
    watch(range, refresh);

    // ---- colours come from the active theme, so charts follow light, dark and the accent ----
    const colors = ref(readColors());
    let themeObserver = null;
    onMounted(() => {
        themeObserver = new MutationObserver(() => (colors.value = readColors()));
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    });
    onBeforeUnmount(() => themeObserver?.disconnect());

    function toRgb(css, fallback) {
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 1;
            const ctx = c.getContext('2d');
            ctx.fillStyle = fallback;
            ctx.fillStyle = css || fallback;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            return [r, g, b];
        } catch {
            return [128, 128, 128];
        }
    }
    function readColors() {
        if (typeof document === 'undefined') {
            return { fg: [230, 230, 230], muted: [140, 140, 140], accent: [79, 227, 160], bg: [16, 18, 21] };
        }
        const cs = getComputedStyle(document.documentElement);
        const v = (name) => cs.getPropertyValue(name).trim();
        return {
            fg: toRgb(v('--foreground'), '#e6e6e6'),
            muted: toRgb(v('--muted-foreground'), '#8c8c8c'),
            accent: toRgb(v('--ax') || v('--primary'), '#4fe3a0'),
            bg: toRgb(v('--background'), '#101215')
        };
    }
    const rgba = (c, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

    // a soft family of tones around the accent, for the donut
    const palette = computed(() => {
        const a = colors.value.accent;
        const f = colors.value.fg;
        const mix = (k) => [0, 1, 2].map((i) => Math.round(a[i] * (1 - k) + f[i] * k));
        return [rgba(a), rgba(mix(0.3)), rgba(mix(0.55)), rgba(f, 0.55), rgba(f, 0.35), rgba(f, 0.2)];
    });

    function base() {
        const c = colors.value;
        return {
            animationDuration: 500,
            textStyle: { fontFamily: 'Inter, sans-serif', color: rgba(c.muted) },
            grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
            tooltip: {
                trigger: 'axis',
                backgroundColor: rgba(c.bg, 0.96),
                borderColor: rgba(c.fg, 0.1),
                borderWidth: 1,
                padding: [8, 12],
                textStyle: { color: rgba(c.fg), fontSize: 12 },
                axisPointer: { type: 'line', lineStyle: { color: rgba(c.fg, 0.15) } }
            }
        };
    }
    function axis(type, extra = {}) {
        const c = colors.value;
        return {
            type,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: rgba(c.muted), fontSize: 11 },
            splitLine: { show: type === 'value', lineStyle: { color: rgba(c.fg, 0.06) } },
            ...extra
        };
    }
    const hours = (ms) => Math.round((ms / 3600000) * 10) / 10;
    const shortDay = (key) => {
        const d = new Date(key + 'T12:00:00');
        return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    };

    const playtimeOption = computed(() => {
        const c = colors.value;
        return {
            ...base(),
            tooltip: { ...base().tooltip, valueFormatter: (v) => `${v} h` },
            xAxis: axis('category', { data: data.value.days.map(shortDay), axisLabel: { color: rgba(c.muted), fontSize: 11, interval: 'auto' } }),
            yAxis: axis('value', { axisLabel: { color: rgba(c.muted), fontSize: 11, formatter: '{value}h' } }),
            series: [
                {
                    type: 'bar',
                    data: data.value.perDay.map(hours),
                    barMaxWidth: 14,
                    itemStyle: {
                        borderRadius: [6, 6, 2, 2],
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: rgba(c.accent) },
                                { offset: 1, color: rgba(c.accent, 0.35) }
                            ]
                        }
                    },
                    emphasis: { itemStyle: { color: rgba(c.accent) } }
                }
            ]
        };
    });

    const weekdays = computed(() => {
        const monday = new Date(2024, 0, 1); // a Monday
        return Array.from({ length: 7 }, (_, i) =>
            new Date(monday.getTime() + i * 86400000).toLocaleDateString([], { weekday: 'short' })
        );
    });
    const heatOption = computed(() => {
        const c = colors.value;
        const cells = [];
        let max = 1;
        data.value.heat.forEach((row, d) =>
            row.forEach((m, h) => {
                cells.push([h, d, Math.round(m)]);
                max = Math.max(max, m);
            })
        );
        return {
            ...base(),
            grid: { left: 4, right: 4, top: 4, bottom: 4, containLabel: true },
            tooltip: {
                ...base().tooltip,
                trigger: 'item',
                formatter: (p) => `${weekdays.value[p.value[1]]} ${String(p.value[0]).padStart(2, '0')}:00 - ${p.value[2]} min`
            },
            xAxis: axis('category', {
                data: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
                splitArea: { show: false },
                axisLabel: { color: rgba(c.muted), fontSize: 10, interval: 3 }
            }),
            yAxis: axis('category', { data: weekdays.value, inverse: true, splitArea: { show: false } }),
            visualMap: {
                show: false,
                min: 0,
                max,
                inRange: { color: [rgba(c.fg, 0.05), rgba(c.accent, 0.45), rgba(c.accent)] }
            },
            series: [
                {
                    type: 'heatmap',
                    data: cells,
                    itemStyle: { borderColor: rgba(c.bg, 1), borderWidth: 2, borderRadius: 4 },
                    emphasis: { itemStyle: { borderColor: rgba(c.fg, 0.6) } }
                }
            ]
        };
    });

    function smoothLine(values, labels, unit = '') {
        const c = colors.value;
        return {
            ...base(),
            tooltip: { ...base().tooltip, valueFormatter: (v) => `${v}${unit}` },
            xAxis: axis('category', { data: labels, boundaryGap: false }),
            yAxis: axis('value', { minInterval: 1, scale: true }),
            series: [
                {
                    type: 'line',
                    data: values,
                    smooth: 0.35,
                    symbol: 'none',
                    lineStyle: { width: 2, color: rgba(c.accent) },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: rgba(c.accent, 0.28) },
                                { offset: 1, color: rgba(c.accent, 0) }
                            ]
                        }
                    }
                }
            ]
        };
    }

    const onlineOption = computed(() =>
        smoothLine(
            data.value.onlineByHour,
            Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
        )
    );
    const growthOption = computed(() =>
        smoothLine(
            data.value.growth.map((g) => g.n),
            data.value.growth.map((g) => shortDay(g.day))
        )
    );

    const worldsOption = computed(() => {
        const c = colors.value;
        const worlds = data.value.topWorlds.slice(0, 6);
        return {
            ...base(),
            tooltip: {
                ...base().tooltip,
                trigger: 'item',
                formatter: (p) => `${p.name}<br/>${fmtDuration(p.value)}`
            },
            series: [
                {
                    type: 'pie',
                    radius: ['62%', '88%'],
                    padAngle: 2,
                    itemStyle: { borderRadius: 6 },
                    label: { show: false },
                    emphasis: { scale: true, scaleSize: 4 },
                    data: worlds.map((w, i) => ({
                        name: w.name,
                        value: w.time,
                        id: w.id,
                        itemStyle: { color: palette.value[i % palette.value.length] }
                    }))
                }
            ],
            graphic: worlds.length
                ? [
                      {
                          type: 'text',
                          left: 'center',
                          top: 'middle',
                          style: {
                              text: String(data.value.worldCount),
                              fill: rgba(c.fg),
                              fontSize: 26,
                              fontWeight: 600,
                              fontFamily: 'Inter, sans-serif'
                          }
                      }
                  ]
                : []
        };
    });
    function openWorld(p) {
        if (p?.data?.id) {
            showWorldDialog(p.data.id);
        }
    }

    const metOption = computed(() => {
        const c = colors.value;
        return {
            ...base(),
            xAxis: axis('category', { data: data.value.days.map(shortDay) }),
            yAxis: axis('value', { minInterval: 1 }),
            series: [
                {
                    type: 'bar',
                    data: data.value.peopleMet,
                    barMaxWidth: 10,
                    itemStyle: { borderRadius: [5, 5, 2, 2], color: rgba(c.fg, 0.55) },
                    emphasis: { itemStyle: { color: rgba(c.accent) } }
                }
            ]
        };
    });

    const maxFriendTime = computed(() => Math.max(1, ...data.value.topFriends.map((f) => f.time)));
    const barWidth = (ms) => `${Math.max(3, Math.round((ms / maxFriendTime.value) * 100))}%`;

    const tiles = computed(() => {
        const d = data.value;
        const activeDays = d.perDay.filter((v) => v > 0).length;
        return [
            {
                label: t('view.insights.tile_time'),
                value: fmtDuration(d.total),
                sub: t('view.insights.tile_time_sub', { n: d.sessions })
            },
            {
                label: t('view.insights.tile_avg'),
                value: fmtDuration(activeDays ? d.perDay.reduce((a, b) => a + b, 0) / activeDays : 0),
                sub: t('view.insights.tile_avg_sub', { n: activeDays })
            },
            {
                label: t('view.insights.tile_worlds'),
                value: d.worldCount,
                sub: t('view.insights.tile_longest', { d: fmtDuration(d.longest) })
            },
            {
                label: t('view.insights.tile_people'),
                value: d.uniquePeople,
                sub: t('view.insights.tile_people_sub', { n: d.topFriends.length })
            }
        ];
    });
</script>

<style scoped>
    .ins-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 7px 8px;
        margin: 0 -8px;
        width: calc(100% + 16px);
        border-radius: 10px;
        text-align: left;
    }
    .ins-bar:hover {
        background: var(--a-soft);
    }
    .ins-bar-rank {
        width: 18px;
        font-size: 0.75rem;
        color: var(--a-muted);
        font-variant-numeric: tabular-nums;
    }
    .ins-bar-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .ins-bar-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.85rem;
    }
    .ins-bar-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ins-bar-value {
        flex: none;
        color: var(--a-muted);
        font-variant-numeric: tabular-nums;
    }
    .ins-bar-track {
        position: relative;
        height: 4px;
        border-radius: 999px;
        background: color-mix(in oklch, var(--foreground) 8%, transparent);
        overflow: hidden;
    }
    .ins-bar-track i {
        position: absolute;
        inset: 0 auto 0 0;
        border-radius: 999px;
        background: var(--a-accent);
    }
    .ins-donut {
        display: grid;
        grid-template-columns: 170px minmax(0, 1fr);
        align-items: center;
        gap: 18px;
    }
    .ins-legend {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }
    .ins-legend-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 8px;
        border-radius: 8px;
        font-size: 0.84rem;
        text-align: left;
    }
    .ins-legend-row:hover {
        background: var(--a-soft);
    }
    .ins-legend-row i {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }
    .ins-legend-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ins-legend-value {
        flex: none;
        color: var(--a-muted);
        font-variant-numeric: tabular-nums;
    }
    @media (max-width: 760px) {
        .ins-donut {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
