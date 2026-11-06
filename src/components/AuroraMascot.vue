<template>
    <div
        class="aurora-mascot"
        :class="{ speaking: isSpeaking }"
        :style="{ width: size + 'px', height: size + 'px', '--lvl': lvl.toFixed(3) }">
        <div class="stage" :class="{ feather: character !== 'neon' }" :style="{ filter: character === 'neon' ? mascotTint : 'none' }">
            <img
                v-for="url in layers"
                :key="url"
                :src="url"
                alt="Aurora"
                draggable="false"
                :style="{ opacity: weights[url] || 0 }" />
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, ref, watch } from 'vue';

    import { mascotTint } from '@/services/auroraAccent';
    import { character, characters, initCharacter } from '@/services/auroraCharacter';
    import { emotion, mouthLevel, speaking } from '@/services/auroraVoice';
    import icon from '../../images/aurora/icon.png';

    const props = defineProps({
        size: { type: Number, default: 96 },
        // leave empty to follow Aurora's live emotion
        expression: { type: String, default: '' },
        // when true the mascot reacts to the voice. Turn off for a static picture.
        reactive: { type: Boolean, default: true }
    });

    // any PNG dropped into images/aurora/mascot/ is picked up (see the README there)
    const sprites = import.meta.glob('../../images/aurora/mascot/*.png', { eager: true, import: 'default' });
    const bySlug = {};
    for (const [path, url] of Object.entries(sprites)) {
        bySlug[path.split('/').pop().replace('.png', '')] = url;
    }

    initCharacter();

    const isSpeaking = computed(() => props.reactive && speaking.value);

    // emotions whose own face already shows the mood, mouth sync would hide it
    const FIXED_FACE = ['angry', 'sad', 'sleepy', 'error', 'surprised'];

    const faceSet = computed(() => characters[character.value] || bySlug);
    function urlFor(name) {
        const own = characters[character.value];
        if (own) return own[name] || null;
        return bySlug[name] || null;
    }
    const mood = computed(() => props.expression || (props.reactive ? emotion.value : 'neutral'));
    const neutralUrl = computed(() => urlFor('neutral') || bySlug.neutral || icon);
    const baseUrl = computed(() => urlFor(mood.value) || neutralUrl.value);

    // every face is a stacked layer, so faces blend into each other instead of swapping like photos
    const layers = computed(() => [...new Set([...Object.values(faceSet.value), neutralUrl.value])]);

    // ---- smooth mouth: a continuous opening value that is eased every frame ----
    const lvl = ref(0); // 0 closed .. 1 wide open
    let raf = 0;
    let target = 0;
    let last = 0;
    let wobble = 0;

    watch(mouthLevel, (v) => {
        target = Math.min(1, v * 1.35);
    });

    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
        last = now;
        wobble += dt * 9;
        const talking = isSpeaking.value && !FIXED_FACE.includes(mood.value);
        // a touch of natural movement so held vowels are not frozen
        const goal = talking ? Math.max(0, Math.min(1, target + Math.sin(wobble) * 0.05 * target)) : 0;
        // fast to open, slower to close, like a real jaw
        const rate = goal > lvl.value ? 22 : 9;
        lvl.value += (goal - lvl.value) * (1 - Math.exp(-rate * dt));
        if (lvl.value < 0.002 && !talking) lvl.value = 0;
        raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    onBeforeUnmount(() => cancelAnimationFrame(raf));

    // closed -> small -> open, blended between neighbours by the opening value
    const weights = computed(() => {
        const w = {};
        const add = (url, v) => {
            if (url && v > 0.001) w[url] = Math.min(1, (w[url] || 0) + v);
        };
        const talking = isSpeaking.value && !FIXED_FACE.includes(mood.value);
        const t = lvl.value;
        if (!talking && t < 0.01) {
            add(baseUrl.value, 1);
            return w;
        }
        const open = urlFor(mood.value === 'joy' ? 'm-laugh' : 'm-happy') || urlFor('m-happy') || baseUrl.value;
        const ladder = [urlFor('m-closed') || neutralUrl.value, urlFor('m-small') || open, open];
        const pos = Math.min(1, t) * (ladder.length - 1);
        const i = Math.min(ladder.length - 2, Math.floor(pos));
        const f = pos - i;
        // the lower shape stays fully visible underneath, the upper one fades in on top (no see-through dip)
        add(ladder[i], 1);
        if (ladder[i + 1] !== ladder[i]) add(ladder[i + 1], f);
        // fade the resting face out as the mouth opens
        const rest = Math.max(0, 1 - t * 4);
        if (rest > 0 && baseUrl.value !== ladder[i]) add(baseUrl.value, rest);
        return w;
    });
</script>

<style scoped>
    .aurora-mascot {
        position: relative;
        display: inline-block;
        transition: filter 0.2s ease;
        animation: aurora-idle 5s ease-in-out infinite alternate;
    }
    @keyframes aurora-idle {
        from {
            transform: translateY(0) rotate(-0.6deg);
        }
        to {
            transform: translateY(-1.5px) rotate(0.6deg);
        }
    }
    .stage {
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: 22%;
        overflow: hidden;
        transform: translateY(calc(var(--lvl, 0) * 1.2px)) scale(calc(1 + var(--lvl, 0) * 0.018));
        transform-origin: 50% 70%;
        will-change: transform;
    }
    /* no box around the picture: its edges fade into whatever is behind it */
    .stage.feather {
        border-radius: 0;
        -webkit-mask-image: radial-gradient(closest-side at 50% 46%, #000 60%, transparent 100%);
        mask-image: radial-gradient(closest-side at 50% 46%, #000 60%, transparent 100%);
    }
    .aurora-mascot img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: opacity 0.14s ease-out;
        user-select: none;
    }
    .aurora-mascot.speaking {
        filter: drop-shadow(0 0 14px var(--ax-glow, var(--aurora-pink, #ff7fb0)));
        animation: aurora-bob 1.1s ease-in-out infinite alternate;
    }
    @keyframes aurora-bob {
        from {
            transform: translateY(0) scale(1);
        }
        to {
            transform: translateY(-2px) rotate(0.8deg);
        }
    }
    .aurora-mascot.speaking img {
        transition: opacity 0.05s linear;
    }
    @media (prefers-reduced-motion: reduce) {
        .aurora-mascot.speaking {
            animation: none;
        }
    }
</style>
