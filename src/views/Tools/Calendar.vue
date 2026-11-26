<template>
    <div class="calendar-page x-container">
        <div class="flex items-center gap-2 ml-2 mb-4">
            <Button variant="ghost" size="sm" class="mr-3" @click="goBack">
                <ArrowLeft />
                {{ t('nav_tooltip.tools') }}
            </Button>
            <span class="header">{{ t('aura_calendar.header') }}</span>
        </div>

        <div class="px-2 space-y-4">
            <p class="text-sm text-muted-foreground max-w-3xl">{{ t('aura_calendar.description') }}</p>

            <!-- month navigation -->
            <div class="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" :disabled="!canGoPrev" @click="shiftMonth(-1)">
                    <ChevronLeft />
                </Button>
                <select
                    v-model.number="viewMonth"
                    class="rounded border bg-background px-2 py-1 text-sm"
                    @change="loadView">
                    <option v-for="(name, i) in monthNames" :key="i" :value="i">{{ name }}</option>
                </select>
                <select v-model.number="viewYear" class="rounded border bg-background px-2 py-1 text-sm" @change="loadView">
                    <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
                </select>
                <Button variant="outline" size="sm" :disabled="!canGoNext" @click="shiftMonth(1)">
                    <ChevronRight />
                </Button>
                <Button variant="outline" size="sm" @click="goToday">{{ t('aura_calendar.today') }}</Button>
                <span class="ml-auto text-xs text-muted-foreground">{{ monthSummary }}</span>
            </div>

            <div v-if="loading" class="text-sm text-muted-foreground">{{ t('aura_calendar.loading') }}</div>

            <div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <!-- month grid -->
                <div>
                    <div class="grid grid-cols-7 gap-1 mb-1 text-xs text-muted-foreground text-center">
                        <div v-for="w in weekdayNames" :key="w">{{ w }}</div>
                    </div>
                    <div class="grid grid-cols-7 gap-1">
                        <div v-for="n in leadingBlanks" :key="'b' + n" />
                        <button
                            v-for="cell in cells"
                            :key="cell.key"
                            type="button"
                            class="relative h-20 rounded border p-1 text-left text-xs overflow-hidden transition-colors hover:border-primary"
                            :class="{
                                'border-primary': cell.key === selectedKey,
                                'ring-1 ring-primary/50': cell.key === todayKey
                            }"
                            :style="{ background: cell.heat }"
                            @click="selectDay(cell.key)">
                            <span class="font-medium">{{ cell.day }}</span>
                            <template v-if="cell.data">
                                <span class="absolute right-1 top-1 text-[10px] text-muted-foreground">
                                    {{ fmtDuration(cell.data.ms) }}
                                </span>
                                <span class="mt-1 block truncate text-[11px] leading-tight">{{ cell.topWorld }}</span>
                                <span class="block text-[10px] text-muted-foreground">
                                    {{ t('aura_calendar.n_visits', { n: cell.data.visits.length }) }}
                                </span>
                            </template>
                        </button>
                    </div>
                    <p v-if="!loading && !days.size" class="mt-3 text-sm text-muted-foreground">
                        {{ t('aura_calendar.empty_month') }}
                    </p>
                </div>

                <!-- day detail -->
                <div class="rounded border p-3 min-h-40">
                    <div v-if="!selected" class="text-sm text-muted-foreground">
                        {{ t('aura_calendar.pick_day') }}
                    </div>
                    <template v-else>
                        <div class="text-base font-semibold">{{ selectedTitle }}</div>
                        <div class="text-xs text-muted-foreground mb-3">
                            {{
                                t('aura_calendar.day_summary', {
                                    time: fmtDuration(selected.ms),
                                    visits: selected.visits.length,
                                    worlds: selected.worlds.size,
                                    people: selected.people.size
                                })
                            }}
                        </div>

                        <div class="space-y-1">
                            <div v-for="(v, i) in selected.visits" :key="v.at + i" class="border-b pb-1">
                                <div class="flex items-start gap-2 text-sm">
                                    <span class="w-24 shrink-0 text-xs text-muted-foreground pt-0.5">
                                        {{ clock(v.start) }}{{ v.time ? ' - ' + clock(v.end) : '' }}
                                    </span>
                                    <button
                                        type="button"
                                        class="min-w-0 flex-1 truncate text-left hover:underline"
                                        :title="v.name"
                                        @click="openWorld(v)">
                                        {{ v.name }}
                                    </button>
                                    <span class="shrink-0 text-xs text-muted-foreground pt-0.5">
                                        {{ fmtDuration(v.time) }}
                                    </span>
                                </div>
                                <div class="ml-24 pl-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span>{{ accessLabel(v) }}</span>
                                    <button type="button" class="underline" @click="togglePeople(v)">
                                        {{
                                            expanded[visitKey(v)]
                                                ? t('aura_calendar.hide_people')
                                                : t('aura_calendar.show_people')
                                        }}
                                    </button>
                                </div>
                                <div v-if="expanded[visitKey(v)]" class="ml-24 pl-2 mt-1 flex flex-wrap gap-1">
                                    <span v-if="expanded[visitKey(v)] === 'loading'" class="text-xs text-muted-foreground">
                                        {{ t('aura_calendar.loading') }}
                                    </span>
                                    <span
                                        v-else-if="!expanded[visitKey(v)].length"
                                        class="text-xs text-muted-foreground">
                                        {{ t('aura_calendar.nobody') }}
                                    </span>
                                    <template v-else>
                                        <button
                                            v-for="p in expanded[visitKey(v)]"
                                            :key="p.name"
                                            type="button"
                                            class="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-accent"
                                            :disabled="!p.id"
                                            @click="p.id && showUserDialog(p.id)">
                                            {{ p.name }}
                                        </button>
                                    </template>
                                </div>
                            </div>
                        </div>

                        <div v-if="!selected.visits.length" class="text-sm text-muted-foreground">
                            {{ t('aura_calendar.no_visits') }}
                        </div>

                        <div v-if="selected.people.size" class="mt-4">
                            <div class="text-sm font-medium mb-1">{{ t('aura_calendar.people_met') }}</div>
                            <div class="flex flex-wrap gap-1">
                                <button
                                    v-for="[name, id] in [...selected.people.entries()].slice(0, peopleLimit)"
                                    :key="name"
                                    type="button"
                                    class="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-accent"
                                    :disabled="!id"
                                    @click="id && showUserDialog(id)">
                                    {{ name }}
                                </button>
                                <button
                                    v-if="selected.people.size > peopleLimit"
                                    type="button"
                                    class="rounded px-1.5 py-0.5 text-xs underline"
                                    @click="peopleLimit = 100000">
                                    {{ t('aura_calendar.more', { n: selected.people.size - peopleLimit }) }}
                                </button>
                            </div>
                        </div>

                        <div v-if="earlier.length" class="mt-4">
                            <div class="text-sm font-medium mb-1">{{ t('aura_calendar.earlier_years') }}</div>
                            <div v-for="(e, i) in earlier" :key="i" class="flex gap-2 text-xs">
                                <span class="w-10 shrink-0 text-muted-foreground">{{ e.year }}</span>
                                <span class="min-w-0 flex-1 truncate">{{ e.name }}</span>
                                <span class="shrink-0 text-muted-foreground">{{ fmtDuration(e.time) }}</span>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, reactive, ref } from 'vue';
    import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-vue-next';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { useRouter } from 'vue-router';

    import { Button } from '@/components/ui/button';

    import {
        dayKey,
        loadBounds,
        loadMonth,
        loadSameDayEarlierYears,
        loadVisitPeople
    } from '../../services/auroraCalendar';
    import { fmtDuration } from '../../services/auroraStats';
    import { parseLocation } from '../../shared/utils/locationParser';
    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { showWorldDialog } from '../../coordinators/worldCoordinator';
    import { useUserStore } from '../../stores/user';

    const { t, locale } = useI18n();
    const router = useRouter();
    const { currentUser } = storeToRefs(useUserStore());

    const now = new Date();
    const viewYear = ref(now.getFullYear());
    const viewMonth = ref(now.getMonth());
    const bounds = ref({ first: null, last: null });
    const days = ref(new Map());
    const loading = ref(false);
    const selectedKey = ref('');
    const earlier = ref([]);
    const expanded = reactive({});
    const peopleLimit = ref(30);
    const todayKey = dayKey(now);
    let loadToken = 0;

    const selfName = () => currentUser.value?.displayName || '';

    const monthNames = computed(() =>
        Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(locale.value, { month: 'long' }))
    );
    // Monday first
    const weekdayNames = computed(() =>
        Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 2 + i).toLocaleDateString(locale.value, { weekday: 'short' }))
    );
    const years = computed(() => {
        const from = bounds.value.first ? bounds.value.first.getFullYear() : now.getFullYear();
        const to = Math.max(now.getFullYear(), bounds.value.last ? bounds.value.last.getFullYear() : 0);
        const list = [];
        for (let y = to; y >= Math.min(from, to); y--) list.push(y);
        return list;
    });

    const monthIndex = (y, m) => y * 12 + m;
    const canGoPrev = computed(() => {
        if (!bounds.value.first) return false;
        return monthIndex(viewYear.value, viewMonth.value) > monthIndex(bounds.value.first.getFullYear(), bounds.value.first.getMonth());
    });
    const canGoNext = computed(() => monthIndex(viewYear.value, viewMonth.value) < monthIndex(now.getFullYear(), now.getMonth()));

    const leadingBlanks = computed(() => (new Date(viewYear.value, viewMonth.value, 1).getDay() + 6) % 7);
    const maxMs = computed(() => Math.max(1, ...[...days.value.values()].map((d) => d.ms)));

    const cells = computed(() => {
        const count = new Date(viewYear.value, viewMonth.value + 1, 0).getDate();
        const out = [];
        for (let day = 1; day <= count; day++) {
            const key = dayKey(new Date(viewYear.value, viewMonth.value, day));
            const data = days.value.get(key) || null;
            let heat = 'transparent';
            let topWorld = '';
            if (data) {
                const pct = 12 + Math.round((data.ms / maxMs.value) * 48);
                heat = `color-mix(in srgb, var(--primary) ${pct}%, transparent)`;
                const byWorld = new Map();
                for (const v of data.visits) byWorld.set(v.name, (byWorld.get(v.name) || 0) + v.time);
                topWorld = [...byWorld.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            }
            out.push({ key, day, data, heat, topWorld });
        }
        return out;
    });

    const monthSummary = computed(() => {
        let ms = 0;
        let visits = 0;
        for (const d of days.value.values()) {
            ms += d.ms;
            visits += d.visits.length;
        }
        return t('aura_calendar.month_summary', { days: days.value.size, time: fmtDuration(ms), visits });
    });

    const selected = computed(() => {
        if (!selectedKey.value) return null;
        return (
            days.value.get(selectedKey.value) || {
                key: selectedKey.value,
                visits: [],
                ms: 0,
                worlds: new Set(),
                people: new Map()
            }
        );
    });
    const selectedTitle = computed(() => {
        const [y, m, d] = selectedKey.value.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString(locale.value, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    });

    function clock(date) {
        return date.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' });
    }

    function visitKey(v) {
        return `${v.at}|${v.location}`;
    }

    function accessLabel(v) {
        const L = parseLocation(v.location);
        const parts = [];
        if (L.accessTypeName) parts.push(L.accessTypeName);
        if (v.group) parts.push(v.group);
        if (L.region) parts.push(L.region.toUpperCase());
        if (L.instanceName) parts.push(`#${L.instanceName}`);
        return parts.join(' - ');
    }

    function openWorld(v) {
        const L = parseLocation(v.location);
        if (L.worldId) showWorldDialog(v.location);
    }

    async function togglePeople(v) {
        const key = visitKey(v);
        if (expanded[key]) {
            delete expanded[key];
            return;
        }
        expanded[key] = 'loading';
        try {
            expanded[key] = await loadVisitPeople(v, selfName());
        } catch (err) {
            console.error('Failed to load people for visit', err);
            expanded[key] = [];
        }
    }

    async function selectDay(key) {
        selectedKey.value = key;
        peopleLimit.value = 30;
        earlier.value = [];
        const [y, m, d] = key.split('-').map(Number);
        try {
            const list = await loadSameDayEarlierYears(new Date(y, m - 1, d));
            // one line per year: the world you spent longest in that day
            const best = new Map();
            for (const e of list) {
                const cur = best.get(e.year);
                if (!cur || e.time > cur.time) best.set(e.year, e);
            }
            if (selectedKey.value === key) earlier.value = [...best.values()].sort((a, b) => b.year - a.year).slice(0, 8);
        } catch (err) {
            console.error('Failed to load earlier years', err);
        }
    }

    async function loadView() {
        const token = ++loadToken;
        loading.value = true;
        try {
            const result = await loadMonth(viewYear.value, viewMonth.value, selfName());
            if (token !== loadToken) return;
            days.value = result;
            const inView = selectedKey.value.startsWith(
                `${viewYear.value}-${String(viewMonth.value + 1).padStart(2, '0')}-`
            );
            if (!inView) {
                // pick the busiest day of the month, or today when it is the current month
                const today = result.has(todayKey) ? todayKey : '';
                const busiest = [...result.values()].sort((a, b) => b.ms - a.ms)[0]?.key || '';
                selectedKey.value = '';
                if (today || busiest) await selectDay(today || busiest);
            }
        } catch (err) {
            console.error('Failed to load calendar month', err);
            days.value = new Map();
        } finally {
            if (token === loadToken) loading.value = false;
        }
    }

    function shiftMonth(delta) {
        const d = new Date(viewYear.value, viewMonth.value + delta, 1);
        viewYear.value = d.getFullYear();
        viewMonth.value = d.getMonth();
        loadView();
    }

    function goToday() {
        viewYear.value = now.getFullYear();
        viewMonth.value = now.getMonth();
        selectedKey.value = '';
        loadView();
    }

    function goBack() {
        router.push({ name: 'tools' });
    }

    onMounted(async () => {
        try {
            bounds.value = await loadBounds();
        } catch (err) {
            console.error('Failed to load calendar bounds', err);
        }
        await loadView();
    });
</script>
