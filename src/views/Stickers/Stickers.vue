<template>
    <div class="a-page">
        <div class="a-page-inner">
            <header class="a-head">
                <div>
                    <h1 class="a-title">{{ t('view.sticker_maker.title') }}</h1>
                    <p class="a-sub">{{ t('view.sticker_maker.desc') }}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="a-btn" @click="router.push({ name: 'gallery', query: { tab: 'stickers' } })">
                        {{ t('view.sticker_maker.open_gallery') }}
                    </button>
                </div>
            </header>

            <section class="a-card">
                <AuroraStickerMaker :vrc-plus="isLocalUserVrcPlusSupporter" :initial-file="initial" @uploaded="onUploaded" />
            </section>

            <section class="a-card">
                <div class="flex items-center gap-3">
                    <h2 class="a-h2 flex-1">{{ t('view.sticker_maker.library') }}</h2>
                    <button type="button" class="a-btn" :disabled="galleryDialogStickersLoading" @click="refreshAll">
                        {{ t('dialog.gallery_icons.refresh') }}
                    </button>
                </div>
                <p v-if="!library.length" class="a-note">{{ t('view.sticker_maker.library_empty') }}</p>
                <div v-else class="st-grid">
                    <div v-for="image in library" :key="image.id" class="st-tile">
                        <template v-if="fileUrl(image)">
                            <Emoji v-if="image.frames" :imageUrl="fileUrl(image)" class="st-pic" />
                            <img v-else :src="fileUrl(image)" loading="lazy" class="st-pic" />
                            <div class="st-meta">
                                <span class="a-note">
                                    {{
                                        image.frames
                                            ? `${image.frames} ${t('view.sticker_maker.frames_short')}, ${image.framesOverTime} fps`
                                            : t('view.sticker_maker.still')
                                    }}
                                </span>
                                <span class="st-actions">
                                    <button
                                        type="button"
                                        class="a-btn st-del"
                                        :title="t(isLocked(image.id) ? 'view.sticker_maker.unlock' : 'view.sticker_maker.lock')"
                                        @click="toggleLock(image)">
                                        <Lock v-if="isLocked(image.id)" :size="14" />
                                        <LockOpen v-else :size="14" />
                                    </button>
                                    <button
                                        type="button"
                                        class="a-btn st-del"
                                        :title="t('view.sticker_maker.keep')"
                                        :disabled="isKept(image.id)"
                                        @click="keep(image)">
                                        <Archive :size="14" />
                                    </button>
                                    <button
                                        type="button"
                                        class="a-btn danger st-del"
                                        :disabled="isLocked(image.id)"
                                        :aria-label="t('view.sticker_maker.delete')"
                                        @click="remove(image.id)">
                                        <Trash2 :size="14" />
                                    </button>
                                </span>
                            </div>
                        </template>
                    </div>
                </div>
            </section>

            <section class="a-card">
                <h2 class="a-h2">{{ t('view.sticker_maker.vault') }}</h2>
                <p class="a-note">{{ t('view.sticker_maker.vault_desc') }}</p>
                <p v-if="!vault.length" class="a-note">{{ t('view.sticker_maker.vault_empty') }}</p>
                <div v-else class="st-grid">
                    <div v-for="rec in vault" :key="rec.key" class="st-tile">
                        <Emoji v-if="rec.params.frames" :imageUrl="dataUrl(rec)" class="st-pic" />
                        <img v-else :src="dataUrl(rec)" loading="lazy" class="st-pic" />
                        <div class="st-meta">
                            <span class="a-note">
                                {{ rec.locked ? t('view.sticker_maker.locked') : '' }}
                                {{ liveIds.has(rec.fileId) ? t('view.sticker_maker.on_account') : t('view.sticker_maker.stored') }}
                            </span>
                            <span class="st-actions">
                                <button
                                    v-if="!liveIds.has(rec.fileId)"
                                    type="button"
                                    class="a-btn st-del"
                                    :disabled="vaultBusy"
                                    :title="t('view.sticker_maker.put_on')"
                                    @click="putOnAccount(rec)">
                                    <Upload :size="14" />
                                </button>
                                <button
                                    type="button"
                                    class="a-btn danger st-del"
                                    :disabled="rec.locked && liveIds.has(rec.fileId)"
                                    :title="t('view.sticker_maker.vault_remove')"
                                    @click="dropFromVault(rec)">
                                    <Trash2 :size="14" />
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { Archive, Lock, LockOpen, Trash2, Upload } from 'lucide-vue-next';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';
    import { useRouter } from 'vue-router';

    import AuroraStickerMaker from '../../components/AuroraStickerMaker.vue';
    import Emoji from '../../components/Emoji.vue';
    import { miscRequest, vrcPlusIconRequest, vrcPlusImageRequest } from '../../api';
    import { listVault, newKey, paramsFor, removeVault, restoreMissing, saveVault } from '../../services/stickerVault';
    import { takePendingSticker } from '../../services/stickerHandoff';
    import { useGalleryStore, useUserStore } from '../../stores';

    const { t } = useI18n();
    const router = useRouter();
    const galleryStore = useGalleryStore();
    const { stickerTable, emojiTable, galleryDialogStickersLoading } = storeToRefs(galleryStore);
    const { refreshStickerTable, refreshEmojiTable, handleStickerAdd } = galleryStore;
    // animations live under VRChat's animated emoji tag, so they are listed beside the stickers
    const library = computed(() => [...emojiTable.value.filter((e) => e.frames), ...stickerTable.value]);
    const { isLocalUserVrcPlusSupporter } = storeToRefs(useUserStore());

    // a file dropped on the Gallery's Stickers tab arrives here
    const initial = ref(takePendingSticker());

    const fileUrl = (image) => image.versions?.[image.versions.length - 1]?.file?.url || '';

    function onUploaded(args, animated) {
        if (animated) {
            emojiTable.value.unshift(args.json);
            refreshEmojiTable();
        } else {
            handleStickerAdd(args);
            // the list only shows the play settings once VRChat's own file record is read
            refreshStickerTable();
        }
    }

    function refreshAll() {
        refreshStickerTable();
        refreshEmojiTable();
    }

    async function remove(id) {
        if (isLocked(id)) return;
        try {
            await miscRequest.deleteFile(id);
            for (const table of [stickerTable.value, emojiTable.value]) {
                const i = table.findIndex((s) => s.id === id);
                if (i !== -1) table.splice(i, 1);
            }
            // a stored copy stays in the vault, just not on the account any more
            const rec = vault.value.find((r) => r.fileId === id);
            if (rec) await saveVault({ ...rec, fileId: null }).then(loadVault);
        } catch (err) {
            console.error('sticker delete failed', err);
            toast.error(t('message.upload.error'));
        }
    }

    // ---- vault: local copies, locking and swapping ----
    const SLOTS = 18;
    const vault = ref([]);
    const vaultBusy = ref(false);
    const liveIds = computed(() => new Set([...stickerTable.value, ...emojiTable.value].map((f) => f.id)));
    const isLocked = (id) => vault.value.some((r) => r.fileId === id && r.locked);
    const isKept = (id) => vault.value.some((r) => r.fileId === id);
    const dataUrl = (rec) => `data:image/png;base64,${rec.base64}`;

    async function loadVault() {
        vault.value = (await listVault()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }

    async function copyOf(image) {
        const version = image.versions?.[image.versions.length - 1]?.version;
        const path = await AppApi.GetImage(fileUrl(image), image.id, String(version));
        const base64 = path ? await AppApi.GetFileBase64(path) : null;
        if (!base64) throw new Error('could not read the sticker file');
        return base64;
    }

    async function keep(image, locked = false) {
        try {
            const existing = vault.value.find((r) => r.fileId === image.id);
            if (existing) {
                await saveVault({ ...existing, locked: locked || existing.locked });
            } else {
                await saveVault({
                    key: newKey(),
                    fileId: image.id,
                    name: image.name || 'sticker',
                    params: paramsFor(image),
                    base64: await copyOf(image),
                    locked,
                    savedAt: Date.now()
                });
            }
            await loadVault();
        } catch (err) {
            console.error('sticker vault: keep failed', err);
            toast.error(t('message.upload.error'));
        }
    }

    async function toggleLock(image) {
        const rec = vault.value.find((r) => r.fileId === image.id);
        if (!rec) return keep(image, true);
        await saveVault({ ...rec, locked: !rec.locked });
        await loadVault();
    }

    async function dropFromVault(rec) {
        await removeVault(rec.key);
        await loadVault();
    }

    async function uploadCopy(rec) {
        const args =
            rec.params.tag === 'sticker'
                ? await vrcPlusImageRequest.uploadSticker(rec.base64, rec.params, undefined, true)
                : await vrcPlusImageRequest.uploadEmoji(rec.base64, rec.params);
        return args;
    }

    // puts a stored sticker on the account, swapping out an unlocked live one when all 18 slots are used
    async function putOnAccount(rec) {
        vaultBusy.value = true;
        try {
            const isSticker = rec.params.tag === 'sticker';
            const table = isSticker ? stickerTable.value : emojiTable.value;
            if (table.length >= SLOTS) {
                const victim = [...table].reverse().find((f) => !isLocked(f.id));
                if (!victim) {
                    toast.error(t('view.sticker_maker.all_locked'));
                    return;
                }
                await keep(victim);
                await miscRequest.deleteFile(victim.id);
                const i = table.findIndex((f) => f.id === victim.id);
                if (i !== -1) table.splice(i, 1);
                const old = vault.value.find((r) => r.fileId === victim.id);
                if (old) await saveVault({ ...old, fileId: null });
            }
            const args = await uploadCopy(rec);
            await saveVault({ ...rec, fileId: args.json.id });
            onUploaded(args, !isSticker);
            await loadVault();
            toast.success(t('message.upload.success'));
        } catch (err) {
            console.error('sticker vault: put on account failed', err);
            toast.error(t('message.upload.error'));
        } finally {
            vaultBusy.value = false;
        }
    }

    // locked stickers that vanished from the account (deleted on the website, say) are uploaded again
    async function checkLocks() {
        try {
            if (!vault.value.some((r) => r.locked && r.fileId)) return;
            const present = new Set();
            for (const tag of ['sticker', 'emoji', 'emojianimated']) {
                const res = await vrcPlusIconRequest.getFileList({ n: 100, tag });
                for (const f of res.json) present.add(f.id);
            }
            const restored = await restoreMissing(present, async (rec) => (await uploadCopy(rec)).json.id);
            if (restored) {
                toast.success(t('view.sticker_maker.restored', { n: restored }));
                refreshAll();
            }
            await loadVault();
        } catch (err) {
            // if the list could not be read, nothing is re-uploaded
            console.error('sticker vault: lock check skipped', err);
        }
    }

    let lockTimer = null;
    onMounted(async () => {
        if (isLocalUserVrcPlusSupporter.value || stickerTable.value.length === 0) refreshAll();
        await loadVault();
        checkLocks();
        lockTimer = setInterval(checkLocks, 3 * 60 * 1000);
    });
    onBeforeUnmount(() => clearInterval(lockTimer));
</script>

<style scoped>
    .st-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 14px;
        margin-top: 14px;
    }
    .st-tile {
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 8px;
        overflow: hidden;
    }
    .st-pic {
        width: 100%;
        aspect-ratio: 1;
        border-radius: 12px;
        object-fit: cover;
    }
    .st-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
    }
    .st-del {
        padding: 4px 8px;
    }
    .st-actions {
        display: flex;
        gap: 4px;
    }
</style>
