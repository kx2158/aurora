<template>
    <div class="avatar-hider-page x-container">
        <div class="flex items-center gap-2 ml-2 mb-4">
            <Button variant="ghost" size="sm" class="mr-3" @click="goBack">
                <ArrowLeft />
                {{ t('nav_tooltip.tools') }}
            </Button>
            <span class="header">{{ t('dialog.avatar_hider.header') }}</span>
            <Button variant="outline" size="sm" class="ml-auto mr-2" :disabled="loading" @click="refresh">
                <RefreshCw class="size-4" />
                {{ t('dialog.avatar_hider.refresh') }}
            </Button>
        </div>

        <div class="max-w-2xl mx-auto space-y-4 px-2">
            <p class="text-sm text-muted-foreground">{{ t('dialog.avatar_hider.description') }}</p>

            <div v-if="!backendOk" class="text-xs rounded bg-destructive/10 text-destructive px-3 py-2">
                {{ t('dialog.avatar_hider.windows_only') }}
            </div>

            <template v-else>
                <div class="text-xs text-muted-foreground">{{ t('dialog.avatar_hider.guard_on') }}</div>
                <div
                    v-if="isGameRunning"
                    class="text-xs rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-3 py-2">
                    {{ t('dialog.avatar_hider.game_running') }}
                </div>

                <!-- Block by avatar ID -->
                <div>
                    <label class="text-sm font-medium mb-1 block">{{ t('dialog.avatar_hider.block_by_id') }}</label>
                    <div class="flex gap-2">
                        <Input
                            v-model="avatarIdInput"
                            :placeholder="t('dialog.avatar_hider.block_by_id_placeholder')"
                            @keydown.enter="blockByAvatarId" />
                        <Button :disabled="busy" @click="blockByAvatarId">
                            {{ t('dialog.avatar_hider.block_by_id_button') }}
                        </Button>
                    </div>
                </div>

                <!-- Blocked -->
                <div>
                    <div class="text-sm font-medium mb-1">
                        {{ t('dialog.avatar_hider.blocked') }} ({{ blockedList.length }})
                    </div>
                    <div v-if="!blockedList.length" class="text-xs text-muted-foreground">
                        {{ t('dialog.avatar_hider.empty_blocked') }}
                    </div>
                    <div v-for="b in blockedList" :key="b.hash" class="flex items-center gap-2 py-1 border-b text-sm">
                        <div class="min-w-0 flex-1">
                            <div class="truncate">{{ b.name || t('dialog.avatar_hider.unknown_avatar') }}</div>
                            <div class="text-xs text-muted-foreground">
                                <span class="font-mono">{{ b.hash }}</span>
                                · {{ t('dialog.avatar_hider.state_' + (blockStates[b.hash] || 'none')) }}
                            </div>
                        </div>
                        <Button variant="outline" size="sm" :disabled="busy" @click="unblock(b.hash)">
                            {{ t('dialog.avatar_hider.unblock') }}
                        </Button>
                    </div>
                </div>

                <!-- Cache entries -->
                <div>
                    <div class="text-sm font-medium mb-1">{{ t('dialog.avatar_hider.cached') }}</div>
                    <div v-if="!cacheRows.length" class="text-xs text-muted-foreground">
                        {{ t('dialog.avatar_hider.empty') }}
                    </div>
                    <div v-for="row in cacheRows" :key="row.hash" class="flex items-center gap-2 py-1 border-b text-sm">
                        <div class="min-w-0 flex-1">
                            <div class="truncate">
                                {{ row.name || t('dialog.avatar_hider.unknown_avatar') }}
                                <Badge v-if="row.recent" variant="secondary" class="ml-1">
                                    {{ t('dialog.avatar_hider.recent') }}
                                </Badge>
                            </div>
                            <div class="text-xs text-muted-foreground">
                                <span class="font-mono">{{ row.hash }}</span>
                                · {{ formatSize(row.sizeBytes) }} · {{ row.versionCount }}
                                {{ t('dialog.avatar_hider.versions') }} · {{ formatDate(row.lastWriteUtc) }}
                            </div>
                        </div>
                        <Button size="sm" :disabled="busy" @click="block(row)">
                            {{ t('dialog.avatar_hider.block') }}
                        </Button>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref } from 'vue';
    import { ArrowLeft, RefreshCw } from 'lucide-vue-next';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';
    import { useRouter } from 'vue-router';

    import { Badge } from '@/components/ui/badge';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';

    import { useAvatarStore } from '../../stores/avatar';
    import { useGameStore } from '../../stores/game';
    import {
        getBlockedList,
        hasBackend,
        hashesForUnityPackages,
        resolveAvatar,
        runGuard,
        saveBlockedList
    } from '../../coordinators/avatarHiderCoordinator';
    import { storeToRefs } from 'pinia';

    const { t } = useI18n();
    const router = useRouter();
    const avatarStore = useAvatarStore();
    const gameStore = useGameStore();
    const { isGameRunning } = storeToRefs(gameStore);

    const RECENT_MS = 10 * 60 * 1000;

    const backendOk = ref(hasBackend());
    const loading = ref(false);
    const busy = ref(false);
    const entries = ref([]);
    const blockedList = ref([]);
    const hashNames = ref({}); // hash -> avatar name
    const avatarIdInput = ref('');
    const blockStates = ref({}); // hash -> active | pending | none

    function goBack() {
        router.push({ name: 'tools' });
    }

    const cacheRows = computed(() =>
        entries.value
            .filter((e) => !e.blocked)
            .map((e) => ({
                ...e,
                name: hashNames.value[e.hash] || '',
                recent: Date.now() - new Date(e.lastWriteUtc).getTime() < RECENT_MS
            }))
            .sort((a, b) => new Date(b.lastWriteUtc) - new Date(a.lastWriteUtc))
    );

    function formatSize(bytes) {
        if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    function formatDate(iso) {
        return new Date(iso).toLocaleString();
    }

    async function buildNameMap() {
        const map = {};
        try {
            for (const ref of avatarStore.cachedAvatars.values()) {
                const hashes = await hashesForUnityPackages(ref.unityPackages);
                for (const h of hashes) map[h] = ref.name;
            }
        } catch (err) {
            console.error('Avatar name matching failed', err);
        }
        hashNames.value = map;
    }

    async function refresh() {
        if (!hasBackend()) {
            backendOk.value = false;
            return;
        }
        loading.value = true;
        try {
            blockedList.value = await getBlockedList();
            entries.value = JSON.parse(await window.AssetBundleManager.ListCacheEntries());
            blockStates.value = JSON.parse(
                await window.AssetBundleManager.GetBlockStates(JSON.stringify(blockedList.value.map((b) => b.hash)))
            );
            await buildNameMap();
        } catch (err) {
            console.error(err);
            toast.error(`${t('dialog.avatar_hider.failed_toast')}: ${err?.message || err}`);
        } finally {
            loading.value = false;
        }
    }

    async function addBlocked(hash, name, avatarId = '') {
        const list = await getBlockedList();
        if (!list.some((b) => b.hash === hash)) {
            list.push({ hash, name, avatarId, addedAt: new Date().toISOString() });
            await saveBlockedList(list);
        }
        return window.AssetBundleManager.BlockCacheEntry(hash);
    }

    async function block(row) {
        busy.value = true;
        try {
            const result = await addBlocked(row.hash, row.name);
            if (result === 'ok') toast.success(t('dialog.avatar_hider.blocked_toast'));
            else if (result === 'ok-pending') toast.warning(t('dialog.avatar_hider.pending_toast'));
            else toast.error(`${t('dialog.avatar_hider.failed_toast')}: ${result}`);
        } catch (err) {
            toast.error(`${t('dialog.avatar_hider.failed_toast')}: ${err?.message || err}`);
        } finally {
            busy.value = false;
            await refresh();
        }
    }

    async function blockByAvatarId() {
        const id = avatarIdInput.value.trim();
        if (!/^avtr_[0-9a-fA-F-]{36}$/.test(id)) {
            toast.error(t('dialog.avatar_hider.invalid_id'));
            return;
        }
        busy.value = true;
        try {
            const { name, hashes } = await resolveAvatar(id);
            for (const h of hashes) await addBlocked(h, name, id);
            toast.success(t('dialog.avatar_hider.avatar_blocked_toast', { count: hashes.length }));
            avatarIdInput.value = '';
        } catch (err) {
            toast.error(`${t('dialog.avatar_hider.failed_toast')}: ${err?.message || err}`);
        } finally {
            busy.value = false;
            await refresh();
        }
    }

    async function unblock(hash) {
        busy.value = true;
        try {
            const result = await window.AssetBundleManager.UnblockCacheEntry(hash);
            if (result !== 'ok') throw new Error(result);
            await saveBlockedList((await getBlockedList()).filter((b) => b.hash !== hash));
            toast.success(t('dialog.avatar_hider.unblocked_toast'));
        } catch (err) {
            toast.error(`${t('dialog.avatar_hider.failed_toast')}: ${err?.message || err}`);
        } finally {
            busy.value = false;
            await refresh();
        }
    }

    onMounted(async () => {
        backendOk.value = hasBackend();
        if (backendOk.value) await runGuard();
        await refresh();
    });
</script>
