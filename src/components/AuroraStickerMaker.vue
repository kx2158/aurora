<template>
    <div class="sm-root">
            <div
                v-if="!source"
                class="sm-drop"
                :class="{ 'sm-drop-over': dragOver }"
                @click="pick"
                @dragover.prevent="dragOver = true"
                @dragleave="dragOver = false"
                @drop.prevent="onDrop">
                <input ref="inputRef" type="file" :accept="ACCEPT" style="display: none" @change="onPick" />
                <Sparkles class="size-6 opacity-70" />
                <div class="text-sm font-medium">
                    {{ converting ? t('view.sticker_maker.converting') : loading ? t('view.sticker_maker.reading') : t('view.sticker_maker.drop') }}
                </div>
                <div class="text-xs text-muted-foreground">{{ t('view.sticker_maker.formats') }}</div>
            </div>

            <div v-else class="sm-body">
                <div class="sm-preview-col">
                    <div class="sm-preview" :class="{ 'sm-checker': !background }">
                        <div v-if="previewUrl" class="sm-frame">
                            <div :key="previewKey" class="absolute top-0 left-0" :style="previewStyle"></div>
                        </div>
                        <Spinner v-if="rendering" class="sm-spin" />
                    </div>
                    <div v-if="mode === 'emoji'" class="text-xs text-muted-foreground text-center">
                        {{ t('view.sticker_maker.summary', { frames: plan.count, fps: plan.fps, seconds: (plan.spanMs / 1000).toFixed(2) }) }}
                    </div>
                    <div class="text-xs text-muted-foreground text-center truncate">{{ fileName }}</div>
                </div>

                <div class="sm-controls">
                    <div class="sm-row">
                        <ToggleGroup v-if="!kind" v-model="mode" type="single" variant="outline" size="sm">
                            <ToggleGroupItem value="sticker">{{ t('view.sticker_maker.mode_sticker') }}</ToggleGroupItem>
                            <ToggleGroupItem value="emoji">{{ t('view.sticker_maker.mode_emoji') }}</ToggleGroupItem>
                        </ToggleGroup>
                        <div class="text-xs text-muted-foreground mt-1">
                            {{ t(mode === 'sticker' ? 'view.sticker_maker.mode_sticker_hint' : 'view.sticker_maker.mode_emoji_hint') }}
                        </div>
                    </div>

                    <div v-if="mode === 'sticker' && source.totalMs > 120 && source.kind !== 'still'" class="sm-row">
                        <div class="sm-label">
                            <span>{{ t('view.sticker_maker.frame') }}</span>
                            <span>{{ fmt(range[0]) }}</span>
                        </div>
                        <Slider v-model="stillAt" :min="0" :max="Math.round(source.totalMs)" :step="10" />
                    </div>

                    <div v-if="mode === 'emoji' && source.totalMs > 120 && source.kind !== 'still'" class="sm-row">
                        <div class="sm-label">
                            <span>{{ t('view.sticker_maker.part') }}</span>
                            <span>{{ fmt(range[0]) }} - {{ fmt(range[1]) }}</span>
                        </div>
                        <Slider v-model="range" :min="0" :max="Math.round(source.totalMs)" :step="10" />
                    </div>

                    <div v-if="mode === 'emoji'" class="sm-row">
                        <div class="sm-label">
                            <span>{{ t('view.sticker_maker.frames') }}</span>
                            <span>{{ count[0] ? count[0] : t('view.sticker_maker.auto', { n: plan.count }) }}</span>
                        </div>
                        <Slider v-model="count" :min="0" :max="64" :step="1" />
                    </div>

                    <div v-if="mode === 'emoji'" class="sm-row">
                        <div class="sm-label">
                            <span>{{ t('view.sticker_maker.speed') }}</span>
                            <span>{{ speed[0].toFixed(2) }}x</span>
                        </div>
                        <Slider v-model="speed" :min="0.25" :max="4" :step="0.05" />
                    </div>

                    <div class="sm-row">
                        <div class="sm-label">
                            <span>{{ t('view.sticker_maker.zoom') }}</span>
                            <span>{{ Math.round(zoom[0] * 100) }}%</span>
                        </div>
                        <Slider v-model="zoom" :min="0.5" :max="3" :step="0.01" />
                    </div>

                    <div class="sm-row sm-two">
                        <div>
                            <div class="sm-label"><span>{{ t('view.sticker_maker.move_x') }}</span></div>
                            <Slider v-model="offX" :min="-1" :max="1" :step="0.01" />
                        </div>
                        <div>
                            <div class="sm-label"><span>{{ t('view.sticker_maker.move_y') }}</span></div>
                            <Slider v-model="offY" :min="-1" :max="1" :step="0.01" />
                        </div>
                    </div>

                    <div class="sm-row sm-inline">
                        <ToggleGroup v-model="fit" type="single" variant="outline" size="sm">
                            <ToggleGroupItem value="cover">{{ t('view.sticker_maker.fill') }}</ToggleGroupItem>
                            <ToggleGroupItem value="contain">{{ t('view.sticker_maker.fit') }}</ToggleGroupItem>
                        </ToggleGroup>
                        <label v-if="mode === 'emoji'" class="sm-switch">
                            <Switch v-model="pingpong" />
                            <span>{{ t('view.sticker_maker.pingpong') }}</span>
                        </label>
                        <label class="sm-switch">
                            <Switch :model-value="Boolean(background)" @update:model-value="(v) => (background = v ? '#ffffff' : '')" />
                            <span>{{ t('view.sticker_maker.background') }}</span>
                        </label>
                        <input v-if="background" v-model="background" type="color" class="sm-color" />
                    </div>

                    <div v-if="mode === 'emoji'" class="sm-row">
                        <div class="sm-label">
                            <span>{{ t('view.sticker_maker.style') }}</span>
                            <span>{{ style }}</span>
                        </div>
                        <div class="sm-styles">
                            <button
                                v-for="(file, name) in emojiAnimationStyleList"
                                :key="name"
                                type="button"
                                class="sm-style"
                                :class="{ on: style === name }"
                                :title="name"
                                @click="style = name">
                                <img :src="`${emojiAnimationStyleUrl}${file}`" loading="lazy" alt="" />
                                <span>{{ name }}</span>
                            </button>
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">{{ t('view.sticker_maker.style_hint') }}</div>
                    </div>

                    <div v-if="result" class="sm-result" :class="result.tone">{{ result.text }}</div>
                </div>
            </div>

            <div class="sm-footer">
                <Button v-if="source" variant="ghost" size="sm" :disabled="busy" @click="reset">
                    <RotateCcw /> {{ t('view.sticker_maker.other_file') }}
                </Button>
                <div class="flex-1"></div>
                <Button v-if="convertedGif" variant="outline" size="sm" :disabled="busy" @click="saveGif">
                    <Download /> {{ t('view.sticker_maker.save_gif') }}
                </Button>
                <Button v-if="source && mode === 'emoji'" variant="outline" size="sm" :disabled="busy || !sheetBlob" @click="saveSheet">
                    <Download /> {{ t('view.sticker_maker.save') }}
                </Button>
                <Button v-if="source" size="sm" :disabled="busy || !sheetBlob || !vrcPlus" @click="mode === 'emoji' ? uploadEmoji() : uploadSticker()">
                    <Upload />
                    {{ uploading ? t('view.sticker_maker.uploading') : t(mode === 'emoji' ? 'view.sticker_maker.upload_emoji' : 'view.sticker_maker.upload_sticker') }}
                </Button>
            </div>
            <p v-if="source && !vrcPlus" class="a-note">{{ t('view.sticker_maker.needs_vrcplus') }}</p>
            <p v-if="source && mode === 'emoji'" class="a-note">{{ t('view.sticker_maker.animated_note') }}</p>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, ref, watch } from 'vue';
    import { Download, RotateCcw, Sparkles, Upload } from 'lucide-vue-next';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { Button } from '@/components/ui/button';
    import { Slider } from '@/components/ui/slider';
    import { Spinner } from '@/components/ui/spinner';
    import { Switch } from '@/components/ui/switch';
    import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

    import { miscRequest, vrcPlusImageRequest } from '../api';
    import { emojiAnimationStyleList, emojiAnimationStyleUrl } from '../shared/constants';
    import { generateEmojiStyle } from '../shared/utils';
    import { readFileAsBase64, withUploadTimeout } from '../shared/utils/imageUpload';
    import { canvasBlob, openSource, renderSheet } from '../services/stickerFrames';
    import { videoToGif } from '../services/gifEncode';
    import { SHEET_SIZE, animatedParams, guessType, isVideoType, keptAnimation, planFrames, sheetFileName, stickerParams } from '../services/stickerSheet';

    const props = defineProps({
        vrcPlus: { type: Boolean, default: false },
        initialFile: { type: Object, default: null },
        // 'sticker' or 'emoji' fixes what this page makes; empty lets the switch choose
        kind: { type: String, default: '' }
    });
    const emit = defineEmits(['uploaded']);
    const { t } = useI18n();

    const ACCEPT = 'image/gif,image/webp,image/png,image/apng,image/jpeg,video/mp4,video/webm,video/quicktime,.gif,.webp,.png,.apng,.jpg,.jpeg,.mp4,.m4v,.mov,.webm,.mkv,.avi,.wmv';
    const PREVIEW = 220;

    const inputRef = ref(null);
    const dragOver = ref(false);
    const loading = ref(false);
    const converting = ref(false);
    // a video is turned into a GIF as soon as it is opened; that GIF is what the maker works from
    const convertedGif = ref(null);
    const source = ref(null);
    const fileName = ref('');

    const range = ref([0, 0]);
    const count = ref([0]);
    const speed = ref([1]);
    const zoom = ref([1]);
    const offX = ref([0]);
    const offY = ref([0]);
    const fit = ref('cover');
    const pingpong = ref(false);
    // stickers are one still picture, emoji are the ones VRChat animates
    const mode = ref(props.kind || 'sticker');
    const style = ref('Stop');
    const stillAt = computed({
        get: () => [range.value[0]],
        set: (v) => {
            range.value = [v[0], Math.max(v[0] + 1, range.value[1])];
        }
    });
    const background = ref('');

    const rendering = ref(false);
    const uploading = ref(false);
    const sheetBlob = ref(null);
    const previewUrl = ref('');
    const previewKey = ref(0);
    const shownPlan = ref({ count: 1, fps: 1, spanMs: 1000 });
    const result = ref(null);

    const busy = computed(() => loading.value || rendering.value || uploading.value);

    const plan = computed(() => {
        if (!source.value) return shownPlan.value;
        return planFrames({
            totalMs: source.value.totalMs,
            startMs: range.value[0],
            endMs: range.value[1],
            count: count.value[0],
            sourceFrames: source.value.sourceFrames,
            starts: source.value.starts,
            speed: speed.value[0]
        });
    });

    const previewStyle = computed(() => {
        const p = shownPlan.value;
        if (p.count <= 1) {
            return `width:${PREVIEW}px;height:${PREVIEW}px;background:url('${previewUrl.value}') 0 0 / ${PREVIEW * 2}px ${PREVIEW * 2}px;`;
        }
        return generateEmojiStyle(previewUrl.value, p.fps, p.count, pingpong.value ? 'pingpong' : 'linear', PREVIEW);
    });

    function fmt(ms) {
        return `${(ms / 1000).toFixed(2)}s`;
    }

    function pick() {
        if (!loading.value) inputRef.value?.click();
    }

    function onPick(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (file) load(file);
    }

    function onDrop(e) {
        dragOver.value = false;
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) load(file);
    }

    async function load(file) {
        const kind = guessType(file.name, file.type);
        if (!/^(image|video)\//.test(kind)) {
            toast.error(t('view.sticker_maker.not_supported'));
            return;
        }
        if (file.size > 200 * 1024 * 1024) {
            toast.error(t('message.file.too_large'));
            return;
        }
        loading.value = true;
        result.value = null;
        try {
            dispose();
            let src = await openSource(file);
            let shownName = file.name;
            convertedGif.value = null;
            if (src.kind === 'video') {
                converting.value = true;
                try {
                    const gif = await videoToGif(src);
                    const gifFile = new File([gif], `${file.name.replace(/\.[^.]+$/, '')}.gif`, { type: 'image/gif' });
                    const fromGif = await openSource(gifFile);
                    src.dispose?.();
                    src = fromGif;
                    shownName = gifFile.name;
                    convertedGif.value = gifFile;
                } catch (err) {
                    // keep working from the video itself
                    console.error('sticker maker: could not convert the video to a GIF', err);
                } finally {
                    converting.value = false;
                }
            }
            source.value = src;
            fileName.value = shownName;
            range.value = [0, Math.round(src.totalMs)];
            // a long video would make a slideshow; start with its first three seconds
            if (src.kind === 'video' && src.totalMs > 3000) range.value = [0, 3000];
            mode.value = props.kind || (src.kind === 'still' ? 'sticker' : 'emoji');
            count.value = [0];
            speed.value = [1];
            zoom.value = [1];
            offX.value = [0];
            offY.value = [0];
            await render();
        } catch (err) {
            console.error('sticker maker: could not read', err);
            toast.error(t(isVideoType(kind) ? 'view.sticker_maker.video_failed' : 'view.sticker_maker.not_supported'));
            source.value = null;
        } finally {
            loading.value = false;
        }
    }

    let renderToken = 0;
    let renderTimer = null;

    function scheduleRender() {
        if (!source.value) return;
        clearTimeout(renderTimer);
        renderTimer = setTimeout(render, 220);
    }

    async function render() {
        if (!source.value) return;
        const token = ++renderToken;
        rendering.value = true;
        try {
            const { canvas, plan: p } = await renderSheet(source.value, {
                startMs: range.value[0],
                endMs: mode.value === 'sticker' ? range.value[0] + 1 : range.value[1],
                count: mode.value === 'sticker' ? 1 : count.value[0],
                speed: speed.value[0],
                fit: fit.value,
                zoom: zoom.value[0],
                offX: offX.value[0],
                offY: offY.value[0],
                background: background.value
            });
            const blob = await canvasBlob(canvas);
            if (token !== renderToken) return;
            if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
            sheetBlob.value = blob;
            previewUrl.value = URL.createObjectURL(blob);
            shownPlan.value = p;
            previewKey.value++;
        } catch (err) {
            console.error('sticker maker: render failed', err);
        } finally {
            if (token === renderToken) rendering.value = false;
        }
    }

    watch([range, count, speed, zoom, offX, offY, fit, background, mode], scheduleRender, { deep: true });
    watch(pingpong, () => previewKey.value++);

    async function upload(blob, params, name, raw = false) {
        const base64 = await readFileAsBase64(blob);
        let args;
        await withUploadTimeout(
            (async () => {
                args =
                    params.tag === 'sticker'
                        ? await vrcPlusImageRequest.uploadSticker(base64, params, name, raw)
                        : await vrcPlusImageRequest.uploadEmoji(base64, params);
            })()
        );
        return args;
    }

    // one frame at full size, cut from the top left quarter of a single-frame sheet
    async function singleFrame() {
        const { canvas } = await renderSheet(source.value, {
            startMs: range.value[0],
            endMs: range.value[0] + 1,
            count: 1,
            fit: fit.value,
            zoom: zoom.value[0],
            offX: offX.value[0],
            offY: offY.value[0],
            background: background.value
        });
        const still = document.createElement('canvas');
        still.width = SHEET_SIZE;
        still.height = SHEET_SIZE;
        still.getContext('2d').drawImage(canvas, 0, 0, SHEET_SIZE / 2, SHEET_SIZE / 2, 0, 0, SHEET_SIZE, SHEET_SIZE);
        return canvasBlob(still);
    }

    async function send(blob, params, animated) {
        uploading.value = true;
        result.value = null;
        try {
            const args = await upload(blob, params);
            if (animated && !keptAnimation(args.json, params)) {
                // stored as a plain image it would show the whole grid, so take it back out
                try {
                    await miscRequest.deleteFile(args.json.id);
                } catch (err) {
                    console.error('sticker maker: could not remove the flat upload', err);
                }
                result.value = { tone: 'bad', text: t('view.sticker_maker.dropped') };
                return;
            }
            emit('uploaded', args, params.tag !== 'sticker');
            result.value = { tone: 'ok', text: t(animated ? 'view.sticker_maker.kept' : 'view.sticker_maker.uploaded_still') };
            toast.success(t('message.upload.success'));
        } catch (err) {
            console.error('sticker maker: upload failed', err);
            result.value = { tone: 'bad', text: t('view.sticker_maker.failed') };
            toast.error(t('message.upload.error'));
        } finally {
            uploading.value = false;
        }
    }

    // a still picture, as a sticker
    async function uploadSticker() {
        if (!source.value) return;
        await send(await singleFrame(), stickerParams({ frames: 1, fps: 1 }), false);
    }

    // frames as an animated emoji (a single frame goes up as a plain emoji)
    async function uploadEmoji() {
        if (!source.value) return;
        const p = shownPlan.value;
        if (p.count > 1) {
            if (!sheetBlob.value) return;
            await send(sheetBlob.value, animatedParams({ frames: p.count, fps: p.fps, pingpong: pingpong.value, style: style.value.toLowerCase() }), true);
        } else {
            await send(await singleFrame(), { tag: 'emoji', animationStyle: style.value.toLowerCase(), maskTag: 'square' }, false);
        }
    }

    function saveGif() {
        if (!convertedGif.value) return;
        const url = URL.createObjectURL(convertedGif.value);
        const a = document.createElement('a');
        a.href = url;
        a.download = convertedGif.value.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function saveSheet() {
        if (!sheetBlob.value) return;
        const p = shownPlan.value;
        const a = document.createElement('a');
        a.href = previewUrl.value;
        a.download = sheetFileName(fileName.value, p.count, p.fps, pingpong.value);
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function dispose() {
        renderToken++;
        clearTimeout(renderTimer);
        source.value?.dispose?.();
        source.value = null;
        convertedGif.value = null;
        sheetBlob.value = null;
        if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
        previewUrl.value = '';
    }

    function reset() {
        dispose();
        result.value = null;
        fileName.value = '';
    }

    watch(
        () => props.initialFile,
        (f) => {
            if (f) load(f);
        },
        { immediate: true }
    );

    onBeforeUnmount(dispose);
</script>

<style scoped>
    .sm-root {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }
    .sm-footer {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }
    .sm-drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 240px;
        border: 1.5px dashed var(--border);
        border-radius: 18px;
        cursor: pointer;
        transition:
            border-color 0.2s,
            background 0.2s;
    }
    .sm-drop:hover,
    .sm-drop-over {
        border-color: var(--primary);
        background: color-mix(in oklab, var(--primary) 7%, transparent);
    }
    .sm-body {
        display: grid;
        grid-template-columns: 240px 1fr;
        gap: 22px;
    }
    .sm-preview-col {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .sm-preview {
        position: relative;
        width: 240px;
        height: 240px;
        border-radius: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border: 1px solid var(--border);
    }
    .sm-frame {
        position: relative;
        width: 220px;
        height: 220px;
        overflow: hidden;
    }
    .sm-checker {
        background-color: color-mix(in oklab, var(--foreground) 4%, transparent);
        background-image:
            linear-gradient(45deg, color-mix(in oklab, var(--foreground) 8%, transparent) 25%, transparent 25%),
            linear-gradient(-45deg, color-mix(in oklab, var(--foreground) 8%, transparent) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, color-mix(in oklab, var(--foreground) 8%, transparent) 75%),
            linear-gradient(-45deg, transparent 75%, color-mix(in oklab, var(--foreground) 8%, transparent) 75%);
        background-size: 18px 18px;
        background-position:
            0 0,
            0 9px,
            9px -9px,
            -9px 0;
    }
    .sm-spin {
        position: absolute;
        right: 10px;
        bottom: 10px;
    }
    .sm-controls {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 0;
    }
    .sm-row {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .sm-two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
    }
    .sm-two > div {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .sm-inline {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        gap: 14px;
    }
    .sm-label {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 500;
    }
    .sm-label span:last-child {
        font-size: 12px;
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
    }
    .sm-switch {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        cursor: pointer;
    }
    .sm-color {
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 50%;
        background: none;
        cursor: pointer;
    }
    .sm-result {
        font-size: 13px;
        padding: 10px 14px;
        border-radius: 14px;
        border: 1px solid var(--border);
    }
    .sm-result.ok {
        border-color: color-mix(in oklab, #3ecf8e 60%, transparent);
        background: color-mix(in oklab, #3ecf8e 10%, transparent);
    }
    .sm-result.bad {
        border-color: color-mix(in oklab, var(--destructive) 60%, transparent);
        background: color-mix(in oklab, var(--destructive) 10%, transparent);
    }
    @media (max-width: 720px) {
        .sm-body {
            grid-template-columns: 1fr;
        }
    }
    .sm-styles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
        gap: 6px;
        max-height: 220px;
        overflow: auto;
        margin-top: 6px;
    }
    .sm-style {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 4px;
        border: 1px solid var(--border);
        border-radius: 12px;
        font-size: 11px;
        background: transparent;
    }
    .sm-style img {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: 8px;
    }
    .sm-style.on {
        border-color: var(--primary, #8b5cf6);
        box-shadow: 0 0 0 1px var(--primary, #8b5cf6);
    }
</style>
