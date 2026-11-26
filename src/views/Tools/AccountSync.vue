<template>
    <div class="account-sync-page x-container">
        <div class="flex items-center gap-2 ml-2 mb-4">
            <Button variant="ghost" size="sm" class="mr-3" @click="goBack">
                <ArrowLeft />
                {{ t('nav_tooltip.tools') }}
            </Button>
            <span class="header">{{ t('dialog.account_sync.header') }}</span>
        </div>

        <div class="max-w-2xl mx-auto space-y-4 px-2">
            <p class="text-sm text-muted-foreground">{{ t('dialog.account_sync.description') }}</p>

            <div class="flex items-center gap-2 text-sm">
                <span>{{ t('dialog.account_sync.logged_in_as') }}</span>
                <b>{{ currentUser?.displayName }}</b>
                <Button variant="outline" size="sm" class="ml-auto" :disabled="busy" @click="saveNow">
                    {{ t('dialog.account_sync.save_now') }}
                </Button>
            </div>

            <!-- Accounts: switch and main -->
            <div>
                <div class="text-sm font-medium mb-1">{{ t('dialog.account_sync.accounts') }}</div>
                <div v-if="!accounts.length" class="text-xs text-muted-foreground">
                    {{ t('dialog.account_sync.no_accounts') }}
                </div>
                <div v-for="a in accounts" :key="a.id" class="flex items-center gap-2 py-1 border-b text-sm">
                    <span class="min-w-0 flex-1 truncate">
                        {{ a.displayName }}
                        <span v-if="a.id === currentUser?.id" class="text-xs text-muted-foreground">
                            ({{ t('dialog.account_sync.current') }})
                        </span>
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        :disabled="busy || a.id === currentUser?.id"
                        @click="switchTo(a.id)">
                        {{ t('dialog.account_sync.switch') }}
                    </Button>
                    <Button variant="outline" size="sm" :disabled="busy" @click="toggleMain(a)">
                        {{ a.isMain ? t('dialog.account_sync.main_on') : t('dialog.account_sync.main_off') }}
                    </Button>
                </div>
                <p class="text-xs text-muted-foreground mt-1">{{ t('dialog.account_sync.accounts_hint') }}</p>
            </div>

            <label class="flex items-center gap-2 text-xs text-muted-foreground">
                <input v-model="promptOnSwitch" type="checkbox" @change="savePrompt" />
                {{ t('dialog.account_sync.ask_on_switch') }}
            </label>

            <div
                v-if="!sources.length"
                class="text-xs rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-3 py-2">
                {{ t('dialog.account_sync.no_sources') }}
            </div>

            <template v-else>
                <div>
                    <label class="text-sm font-medium mb-1 block">{{ t('dialog.account_sync.copy_from') }}</label>
                    <select v-model="sourceId" class="w-full rounded border bg-background px-2 py-1 text-sm">
                        <option v-for="s in sources" :key="s.userId" :value="s.userId">
                            {{ s.displayName }} - {{ formatDate(s.takenAt) }}
                        </option>
                    </select>
                </div>

                <div v-if="source" class="space-y-2">
                    <label class="flex items-center gap-2 text-sm">
                        <input v-model="what.profile" type="checkbox" />
                        {{ t('dialog.account_sync.profile') }}
                        <span class="text-xs text-muted-foreground">{{ t('dialog.account_sync.profile_hint') }}</span>
                    </label>
                    <label class="flex items-center gap-2 text-sm">
                        <input v-model="what.groups" type="checkbox" />
                        {{ t('dialog.account_sync.groups') }} ({{ source.groups?.length || 0 }})
                    </label>
                    <label class="flex items-center gap-2 text-sm">
                        <input v-model="what.moderations" type="checkbox" />
                        {{ t('dialog.account_sync.moderations') }} ({{ source.moderations?.length || 0 }})
                    </label>
                    <label class="flex items-center gap-2 text-sm">
                        <input v-model="what.favoriteWorlds" type="checkbox" />
                        {{ t('dialog.account_sync.fav_worlds') }} ({{ source.favoriteWorlds?.length || 0 }})
                    </label>
                    <label class="flex items-center gap-2 text-sm">
                        <input v-model="what.favoriteAvatars" type="checkbox" />
                        {{ t('dialog.account_sync.fav_avatars') }} ({{ source.favoriteAvatars?.length || 0 }})
                    </label>
                </div>

                <div class="flex gap-2">
                    <Button :disabled="busy || !anySelected" @click="run(false)">
                        {{ t('dialog.account_sync.copy_selected') }}
                    </Button>
                    <Button variant="secondary" :disabled="busy" @click="run(true)">
                        {{ t('dialog.account_sync.copy_everything') }}
                    </Button>
                    <Button v-if="busy" variant="outline" @click="cancel">
                        {{ t('dialog.account_sync.cancel') }}
                    </Button>
                    <Button variant="ghost" class="ml-auto" :disabled="busy" @click="forget">
                        {{ t('dialog.account_sync.forget') }}
                    </Button>
                </div>

                <p class="text-xs text-muted-foreground">{{ t('dialog.account_sync.limits') }}</p>
            </template>

            <div v-if="progress" class="text-xs text-muted-foreground">{{ progress }}</div>

            <div v-if="summaryLines.length" class="rounded border p-3 text-sm space-y-1">
                <div v-for="(line, i) in summaryLines" :key="i" :class="line.bad ? 'text-destructive' : ''">
                    {{ line.text }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
    import { ArrowLeft } from 'lucide-vue-next';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';
    import { useRoute, useRouter } from 'vue-router';

    import { Button } from '@/components/ui/button';

    import {
        applySnapshot,
        captureSnapshot,
        deleteSnapshot,
        getPromptOnSwitch,
        getSnapshots,
        listSavedAccounts,
        setMainUserId,
        setPromptOnSwitch,
        switchAccount
    } from '../../coordinators/accountSyncCoordinator';
    import { storeToRefs } from 'pinia';
    import { useUserStore } from '../../stores/user';

    const { t } = useI18n();
    const router = useRouter();
    const route = useRoute();
    const { currentUser } = storeToRefs(useUserStore());

    const snapshots = ref({});
    const accounts = ref([]);
    const sourceId = ref('');
    const busy = ref(false);
    const progress = ref('');
    const summaryLines = ref([]);
    const promptOnSwitch = ref(true);
    const what = reactive({
        profile: true,
        groups: true,
        moderations: true,
        favoriteWorlds: true,
        favoriteAvatars: true
    });
    let abortController = null;

    const sources = computed(() =>
        Object.values(snapshots.value)
            .filter((s) => s.userId !== currentUser.value?.id)
            .sort((a, b) => (b.takenAt || '').localeCompare(a.takenAt || ''))
    );
    const source = computed(() => snapshots.value[sourceId.value] || null);
    const anySelected = computed(() => Object.values(what).some(Boolean));

    watch(sources, (list) => {
        if (!list.some((s) => s.userId === sourceId.value)) sourceId.value = list[0]?.userId || '';
    });

    function formatDate(iso) {
        try {
            return new Date(iso).toLocaleString();
        } catch {
            return iso || '';
        }
    }

    function goBack() {
        router.push({ name: 'tools' });
    }

    async function switchTo(userId) {
        try {
            await switchAccount(userId);
            await reload();
        } catch (err) {
            toast.error(err?.message || String(err));
        }
    }

    async function toggleMain(account) {
        await setMainUserId(account.isMain ? '' : account.id);
        await reload();
    }

    async function reload() {
        accounts.value = await listSavedAccounts();
        snapshots.value = await getSnapshots();
        const wanted = route.query.from;
        if (typeof wanted === 'string' && snapshots.value[wanted]) sourceId.value = wanted;
        else if (!sourceId.value) sourceId.value = sources.value[0]?.userId || '';
    }

    async function savePrompt() {
        await setPromptOnSwitch(promptOnSwitch.value);
    }

    async function saveNow() {
        busy.value = true;
        try {
            await captureSnapshot();
            await reload();
            toast.success(t('dialog.account_sync.saved_toast'));
        } catch (err) {
            toast.error(`${t('dialog.account_sync.failed_toast')}: ${err?.message || err}`);
        } finally {
            busy.value = false;
        }
    }

    async function forget() {
        if (!sourceId.value) return;
        await deleteSnapshot(sourceId.value);
        sourceId.value = '';
        await reload();
    }

    function cancel() {
        abortController?.abort();
    }

    function describeSection(name, r) {
        if (!r) return [];
        const lines = [];
        if (name === 'profile') {
            lines.push({
                text: r.ok ? t('dialog.account_sync.done_profile') : `${t('dialog.account_sync.profile')}: ${r.error}`,
                bad: !r.ok
            });
            return lines;
        }
        if (name === 'groups') {
            lines.push({
                text: t('dialog.account_sync.done_groups', {
                    joined: r.joined,
                    requested: r.requested,
                    already: r.already,
                    failed: r.failed.length
                })
            });
        } else {
            const labelKeys = { moderations: 'moderations', favoriteWorlds: 'fav_worlds', favoriteAvatars: 'fav_avatars' };
            lines.push({
                text: t('dialog.account_sync.done_generic', {
                    name: t(`dialog.account_sync.${labelKeys[name]}`),
                    added: r.added,
                    already: r.already,
                    failed: r.failed.length
                })
            });
        }
        for (const f of r.failed.slice(0, 10)) lines.push({ text: `   - ${f}`, bad: true });
        if (r.failed.length > 10) lines.push({ text: `   ... +${r.failed.length - 10}`, bad: true });
        return lines;
    }

    async function run(everything) {
        if (!sourceId.value || busy.value) return;
        const picked = everything
            ? { profile: true, groups: true, moderations: true, favoriteWorlds: true, favoriteAvatars: true }
            : { ...what };
        busy.value = true;
        summaryLines.value = [];
        progress.value = '';
        abortController = new AbortController();
        try {
            const summary = await applySnapshot(sourceId.value, picked, {
                onProgress: (msg) => (progress.value = msg),
                signal: abortController.signal
            });
            const lines = [];
            for (const key of ['profile', 'groups', 'moderations', 'favoriteWorlds', 'favoriteAvatars']) {
                lines.push(...describeSection(key, summary[key]));
            }
            if (summary.cancelled) lines.push({ text: t('dialog.account_sync.cancelled'), bad: true });
            summaryLines.value = lines;
            progress.value = '';
            // refresh this account's own snapshot so it can be copied further
            captureSnapshot().catch(() => {});
        } catch (err) {
            toast.error(`${t('dialog.account_sync.failed_toast')}: ${err?.message || err}`);
        } finally {
            busy.value = false;
            abortController = null;
        }
    }

    onMounted(async () => {
        promptOnSwitch.value = await getPromptOnSwitch();
        await reload();
    });

    onBeforeUnmount(() => abortController?.abort());
</script>
