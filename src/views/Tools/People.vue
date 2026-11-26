<template>
    <div class="people-page x-container">
        <div class="flex items-center gap-2 ml-2 mb-4">
            <Button variant="ghost" size="sm" class="mr-3" @click="goBack">
                <ArrowLeft />
                {{ t('nav_tooltip.tools') }}
            </Button>
            <span class="header">{{ t('aura_people.header') }}</span>
        </div>

        <div class="px-2 space-y-4 max-w-3xl">
            <p class="text-sm text-muted-foreground">{{ t('aura_people.description') }}</p>

            <div class="flex items-center gap-2">
                <input
                    ref="input"
                    v-model="query"
                    type="text"
                    class="flex-1 rounded border bg-background px-3 py-2 text-sm"
                    :placeholder="t('aura_people.placeholder')"
                    @keydown.enter="searchOnline" />
                <Button variant="outline" size="sm" :disabled="query.trim().length < 2 || onlineLoading" @click="searchOnline">
                    {{ onlineLoading ? t('aura_people.searching') : t('aura_people.search_vrchat') }}
                </Button>
            </div>

            <div v-if="query.trim().length < 1" class="text-sm text-muted-foreground">
                {{ t('aura_people.start_typing') }}
            </div>

            <template v-else>
                <section v-if="friendRows.length">
                    <div class="text-sm font-medium mb-1">{{ t('aura_people.friends') }}</div>
                    <button
                        v-for="p in friendRows"
                        :key="p.id"
                        type="button"
                        class="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-accent"
                        @click="open(p)">
                        <img :src="userImage(p.ref)" class="size-7 rounded-full object-cover" loading="lazy" />
                        <span class="min-w-0 flex-1 truncate" :style="{ color: p.ref?.$userColour }">{{ p.name }}</span>
                        <span class="text-xs text-muted-foreground">{{ p.ref?.state || '' }}</span>
                    </button>
                </section>

                <section v-if="metRows.length">
                    <div class="text-sm font-medium mb-1">{{ t('aura_people.met') }}</div>
                    <div v-for="p in metRows" :key="p.name" class="rounded hover:bg-accent/50">
                        <div class="flex items-center gap-3 px-2 py-1.5">
                            <button
                                type="button"
                                class="min-w-0 flex-1 truncate text-left"
                                :disabled="!p.id && !p.ref"
                                @click="open(p)">
                                {{ p.name }}
                            </button>
                            <span class="shrink-0 text-xs text-muted-foreground">
                                {{ t('aura_people.times_met', { n: p.count }) }} - {{ t('aura_people.last') }}
                                {{ day(p.last) }}
                            </span>
                            <button type="button" class="shrink-0 text-xs underline" @click="toggleWhere(p)">
                                {{ where[p.name] ? t('aura_people.hide') : t('aura_people.where') }}
                            </button>
                        </div>
                        <div v-if="where[p.name]" class="px-2 pb-2 pl-5 space-y-0.5">
                            <div v-if="where[p.name] === 'loading'" class="text-xs text-muted-foreground">...</div>
                            <template v-else>
                                <div
                                    v-for="(w, i) in where[p.name]"
                                    :key="i"
                                    class="flex gap-2 text-xs text-muted-foreground">
                                    <span class="w-36 shrink-0">{{ stamp(w.at) }}</span>
                                    <span class="min-w-0 flex-1 truncate">{{ w.world || w.location }}</span>
                                </div>
                            </template>
                        </div>
                    </div>
                    <div v-if="metTruncated" class="px-2 text-xs text-muted-foreground">
                        {{ t('aura_people.limit') }}
                    </div>
                </section>

                <section v-if="onlineSearched">
                    <div class="text-sm font-medium mb-1">{{ t('aura_people.vrchat') }}</div>
                    <div v-if="!onlineRows.length" class="px-2 text-sm text-muted-foreground">
                        {{ t('aura_people.no_online') }}
                    </div>
                    <button
                        v-for="p in onlineRows"
                        :key="p.id"
                        type="button"
                        class="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-accent"
                        @click="open(p)">
                        <img :src="userImage(p.ref)" class="size-7 rounded-full object-cover" loading="lazy" />
                        <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
                        <span class="text-xs text-muted-foreground">{{ p.ref?.isFriend ? t('aura_people.friend') : '' }}</span>
                    </button>
                </section>

                <div
                    v-if="!friendRows.length && !metRows.length && !onlineSearched"
                    class="text-sm text-muted-foreground">
                    {{ t('aura_people.nothing_local') }}
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, reactive, ref, watch } from 'vue';
    import { ArrowLeft } from 'lucide-vue-next';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { useRoute, useRouter } from 'vue-router';

    import { Button } from '@/components/ui/button';

    import { loadWhereMet, searchMetPeople } from '../../services/auroraPeople';
    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { useFriendStore } from '../../stores/friend';
    import { useSearchStore } from '../../stores/search';
    import { useUserDisplay } from '../../composables/useUserDisplay';
    import { useUserStore } from '../../stores/user';

    const { t, locale } = useI18n();
    const router = useRouter();
    const route = useRoute();
    const { userImage } = useUserDisplay();
    const friendStore = useFriendStore();
    const userStore = useUserStore();
    const searchStore = useSearchStore();
    const { currentUser } = storeToRefs(userStore);
    const { searchUserResults } = storeToRefs(searchStore);

    const input = ref(null);
    const query = ref(typeof route.query.q === 'string' ? route.query.q : '');
    const met = ref([]);
    const where = reactive({});
    const onlineSearched = ref(false);
    const onlineLoading = ref(false);
    const onlineRows = ref([]);
    let timer = null;
    let token = 0;

    const needle = computed(() => query.value.trim().toLowerCase());

    const friendRows = computed(() => {
        if (!needle.value) return [];
        const rows = [];
        for (const ctx of friendStore.friends.values()) {
            const ref = ctx.ref;
            if (!ref?.displayName) continue;
            if (ref.displayName.toLowerCase().includes(needle.value)) {
                rows.push({ id: ref.id, name: ref.displayName, ref });
            }
        }
        return rows.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
    });

    const friendIds = computed(() => new Set(friendRows.value.map((r) => r.id)));

    const metRows = computed(() =>
        met.value
            .filter((p) => !p.id || !friendIds.value.has(p.id))
            .map((p) => ({ ...p, ref: p.id ? userStore.cachedUsers.get(p.id) : undefined }))
    );
    const metTruncated = computed(() => met.value.length >= 100);

    function day(iso) {
        const d = new Date(iso);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale.value);
    }
    function stamp(iso) {
        const d = new Date(iso);
        return isNaN(d.getTime())
            ? ''
            : d.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' });
    }

    function open(p) {
        if (p.id) showUserDialog(p.id);
        else searchByName(p.name);
    }

    async function searchByName(name) {
        query.value = name;
        await searchOnline();
    }

    async function toggleWhere(p) {
        if (where[p.name]) {
            delete where[p.name];
            return;
        }
        where[p.name] = 'loading';
        try {
            where[p.name] = await loadWhereMet(p.name);
        } catch (err) {
            console.error('Failed to load where met', err);
            where[p.name] = [];
        }
    }

    async function runLocal() {
        const mine = ++token;
        const q = query.value.trim();
        if (!q) {
            met.value = [];
            return;
        }
        try {
            const rows = await searchMetPeople(q, currentUser.value?.displayName || '');
            if (mine === token) met.value = rows;
        } catch (err) {
            console.error('Failed to search met people', err);
            if (mine === token) met.value = [];
        }
    }

    async function searchOnline() {
        const q = query.value.trim();
        if (q.length < 2 || onlineLoading.value) return;
        onlineLoading.value = true;
        try {
            await searchStore.searchUserByDisplayName(q);
            onlineRows.value = searchUserResults.value.map((ref) => ({ id: ref.id, name: ref.displayName, ref }));
            onlineSearched.value = true;
        } catch (err) {
            console.error('VRChat user search failed', err);
            onlineRows.value = [];
            onlineSearched.value = true;
        } finally {
            onlineLoading.value = false;
        }
    }

    watch(query, () => {
        onlineSearched.value = false;
        clearTimeout(timer);
        timer = setTimeout(runLocal, 200);
    });

    function goBack() {
        router.push({ name: 'tools' });
    }

    onMounted(async () => {
        input.value?.focus();
        if (query.value.trim()) {
            await runLocal();
            // coming from quick search with a name: show everyone on VRChat too
            if (route.query.online === '1') await searchOnline();
        }
    });
</script>
