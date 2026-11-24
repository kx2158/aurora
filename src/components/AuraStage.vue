<template>
    <section class="stage" :class="`stage-${variant}`" aria-hidden="true">
        <!-- ink type, softened by a frosted sheet from the middle down -->
        <div class="stage-kanji" :style="{ fontSize: size + 'px', [side]: offset }">{{ kanji }}</div>
        <div class="stage-frost"></div>
        <slot />
    </section>
</template>

<script setup>
    defineProps({
        kanji: { type: String, required: true },
        size: { type: Number, default: 300 },
        side: { type: String, default: 'left' },
        offset: { type: String, default: '8%' },
        variant: { type: String, default: 'a' }
    });
</script>

<style>
    .stage {
        position: relative;
        flex: 1 1 380px;
        min-width: 0;
        min-height: 760px;
        overflow: hidden;
        align-self: stretch;
    }
    .stage-kanji {
        position: absolute;
        top: 6px;
        writing-mode: vertical-rl;
        font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Noto Serif CJK JP', serif;
        font-weight: 300;
        line-height: 1;
        color: var(--aura-kanji-ink, #26282b);
        user-select: none;
    }
    .stage-frost {
        position: absolute;
        inset: 22% 0 0 0;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), var(--aura-frost, rgba(242, 243, 245, 0.62)));
        -webkit-backdrop-filter: blur(28px);
        backdrop-filter: blur(28px);
        -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 52%);
        mask-image: linear-gradient(180deg, transparent 0%, #000 52%);
    }
    .stage svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }
    .stage svg text {
        fill: var(--aura-ink);
        font-family: var(--aura-font, 'Helvetica Neue', Helvetica, Arial, sans-serif);
        font-size: 11px;
        letter-spacing: 0.16em;
    }
</style>
