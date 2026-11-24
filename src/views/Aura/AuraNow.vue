<template>
    <div class="au-page">
        <section class="au-left">
            <div class="aura-label">今 · {{ today }}</div>
            <h1 class="au-big">{{ t('aura.now.here', { n: here }) }}</h1>
            <p class="au-sub">{{ t('aura.now.in', { n: instances.length }) }}</p>
            <div class="au-counts">
                <div><b>{{ away }}</b>&nbsp; {{ t('aura.now.away') }}</div>
                <div><b>{{ offline }}</b>&nbsp; {{ t('aura.now.offline') }}</div>
            </div>

            <div class="aura-label au-gap">{{ t('aura.now.instances') }}</div>
            <div v-if="!instances.length" class="au-empty">{{ t('aura.now.none') }}</div>
            <div v-for="(i, n) in instances" :key="i.tag" class="au-item">
                <div class="au-num">{{ String(n + 1).padStart(2, '0') }}</div>
                <div class="au-grow">
                    <div class="au-title">{{ names[i.tag] || t('aura.now.unknown_world') }}</div>
                    <div class="au-meta">{{ i.access }}</div>
                </div>
                <div class="au-people">
                    <span v-for="p in i.people.slice(0, 3)" :key="p.id">{{ p.name }}</span>
                    <span v-if="i.people.length > 3" class="au-meta">+{{ i.people.length - 3 }}</span>
                </div>
                <button type="button" class="au-link" @click="launch.showLaunchDialog(i.tag)">{{ t('aura.join') }}</button>
            </div>
        </section>

        <AuraStage kanji="気配" :size="300" offset="7%">
            <!-- a glass orb with a line out to every instance -->
            <svg viewBox="0 0 600 800" preserveAspectRatio="xMidYMid meet" fill="none">
                <defs>
                    <radialGradient id="orb" cx="36%" cy="30%" r="75%">
                        <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
                        <stop offset="0.45" stop-color="#dfe3e8" stop-opacity="0.55" />
                        <stop offset="1" stop-color="#7f8793" stop-opacity="0.45" />
                    </radialGradient>
                    <clipPath id="orbclip"><circle cx="300" cy="400" r="104" /></clipPath>
                    <filter id="soft"><feGaussianBlur stdDeviation="14" /></filter>
                    <filter id="soft2"><feGaussianBlur stdDeviation="2.2" /></filter>
                </defs>
                <line x1="150" y1="110" x2="150" y2="700" class="s-dash" />
                <path v-for="n in nodes" :key="'l' + n.tag" :d="n.path" class="s-line" />
                <ellipse cx="300" cy="528" rx="150" ry="14" fill="#5a5f66" opacity="0.28" filter="url(#soft)" />
                <circle class="orb-pulse" cx="300" cy="400" r="104" fill="url(#orb)" />
                <g clip-path="url(#orbclip)">
                    <text x="262" y="452" class="s-orb-kanji" filter="url(#soft2)">気</text>
                    <ellipse cx="262" cy="338" rx="62" ry="30" fill="#fff" opacity="0.7" filter="url(#soft2)" />
                </g>
                <circle cx="300" cy="400" r="104" class="s-rim" />
                <circle cx="300" cy="400" r="2.6" class="s-dot" />
                <template v-for="n in nodes" :key="'n' + n.tag">
                    <circle :cx="n.x" :cy="n.y" r="3.2" class="s-node" />
                    <text :x="n.x - 14" :y="n.y - 10" text-anchor="end">{{ n.label }}</text>
                </template>
            </svg>
        </AuraStage>
    </div>
</template>

<script setup>
    import { computed, reactive, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import AuraStage from '../../components/AuraStage.vue';
    import { isRealInstance } from '../../shared/utils/instance';
    import { getWorldName } from '../../shared/utils/world';
    import { useFriendStore, useLaunchStore } from '../../stores';

    const { t } = useI18n();
    const launch = useLaunchStore();
    const { onlineFriends, vipFriends, activeFriends, offlineFriends } = storeToRefs(useFriendStore());

    const today = computed(() =>
        new Date().toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', weekday: 'short' }).toUpperCase()
    );
    const inGame = computed(() => [...vipFriends.value, ...onlineFriends.value]);
    const here = computed(() => inGame.value.length);
    const away = computed(() => activeFriends.value.length);
    const offline = computed(() => offlineFriends.value.length);

    const instances = computed(() => {
        const by = new Map();
        for (const f of inGame.value) {
            const L = f.ref?.$location;
            const tag = L?.tag;
            if (!tag || !isRealInstance(tag)) continue;
            if (!by.has(tag)) by.set(tag, { tag, access: L.accessTypeName || '', people: [] });
            by.get(tag).people.push({ id: f.id, name: f.ref.displayName || f.name || f.id });
        }
        return [...by.values()].sort((a, b) => b.people.length - a.people.length).slice(0, 12);
    });

    const names = reactive({});
    const asked = new Set();
    watch(
        instances,
        (list) => {
            for (const i of list) {
                if (asked.has(i.tag)) continue;
                asked.add(i.tag);
                getWorldName(i.tag).then((n) => {
                    if (n) names[i.tag] = n;
                });
            }
        },
        { immediate: true }
    );

    // where the nodes sit around the orb, taken from the concept board
    const SLOTS = [
        [560, 200, 'M300 400 C380 380 470 230 560 200'],
        [570, 420, 'M300 400 C390 410 480 420 570 420'],
        [540, 640, 'M300 400 C380 450 470 610 540 640'],
        [500, 90, 'M300 400 C360 330 420 150 500 90'],
        [520, 520, 'M300 400 C370 430 440 500 520 520'],
        [530, 320, 'M300 400 C370 380 450 340 530 320']
    ];
    const nodes = computed(() =>
        instances.value.slice(0, SLOTS.length).map((i, k) => ({
            tag: i.tag,
            x: SLOTS[k][0],
            y: SLOTS[k][1],
            path: SLOTS[k][2],
            label: (names[i.tag] || i.access || '').toLowerCase()
        }))
    );
</script>
