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
                    <button type="button" class="a-btn" :disabled="galleryDialogStickersLoading" @click="refreshStickerTable">
                        {{ t('dialog.gallery_icons.refresh') }}
                    </button>
                </div>
                <p v-if="!stickerTable.length" class="a-note">{{ t('view.sticker_maker.library_empty') }}</p>
                <div v-else class="st-grid">
                    <div v-for="image in stickerTable" :key="image.id" class="st-tile">
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
                                <button type="button" class="a-btn danger st-del" :aria-label="t('view.sticker_maker.delete')" @click="remove(image.id)">
                                    <Trash2 :size="14" />
                                </button>
                            </div>
                        </template>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
    import { onMounted, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { Trash2 } from 'lucide-vue-next';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';
    import { useRouter } from 'vue-router';

    import AuroraStickerMaker from '../../components/AuroraStickerMaker.vue';
    import Emoji from '../../components/Emoji.vue';
    import { miscRequest } from '../../api';
    import { takePendingSticker } from '../../services/stickerHandoff';
    import { useGalleryStore, useUserStore } from '../../stores';

    const { t } = useI18n();
    const router = useRouter();
    const galleryStore = useGalleryStore();
    const { stickerTable, galleryDialogStickersLoading } = storeToRefs(galleryStore);
    const { refreshStickerTable, handleStickerAdd } = galleryStore;
    const { isLocalUserVrcPlusSupporter } = storeToRefs(useUserStore());

    // a file dropped on the Gallery's Stickers tab arrives here
    const initial = ref(takePendingSticker());

    const fileUrl = (image) => image.versions?.[image.versions.length - 1]?.file?.url || '';

    function onUploaded(args) {
        handleStickerAdd(args);
        // the list only shows the play settings once VRChat's own file record is read
        refreshStickerTable();
    }

    async function remove(id) {
        try {
            await miscRequest.deleteFile(id);
            const i = stickerTable.value.findIndex((s) => s.id === id);
            if (i !== -1) stickerTable.value.splice(i, 1);
        } catch (err) {
            console.error('sticker delete failed', err);
            toast.error(t('message.upload.error'));
        }
    }

    onMounted(() => {
        if (isLocalUserVrcPlusSupporter.value || stickerTable.value.length === 0) refreshStickerTable();
    });
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
</style>
