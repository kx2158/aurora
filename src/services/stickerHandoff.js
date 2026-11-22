/** A file picked or dropped somewhere else (the Gallery's Stickers tab) waiting for the Stickers page to take it. */
import { ref } from 'vue';

export const pendingStickerFile = ref(null);

export function takePendingSticker() {
    const f = pendingStickerFile.value;
    pendingStickerFile.value = null;
    return f;
}
