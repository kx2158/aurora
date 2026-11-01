<template>
    <div class="aurora-mascot" :class="{ speaking: isSpeaking }" :style="{ width: size + 'px', height: size + 'px' }">
        <img :src="src" alt="Neon" draggable="false" />
    </div>
</template>

<script setup>
    import { computed, ref, watch } from 'vue';

    import { emotion, mouthLevel, speaking } from '@/services/auroraVoice';
    import icon from '../../images/aurora/icon.png';

    const props = defineProps({
        size: { type: Number, default: 96 },
        // leave empty to follow Neon's live emotion
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

    const isSpeaking = computed(() => props.reactive && speaking.value);

    // emotions whose own face already shows the mood, mouth sync would hide it
    const FIXED_FACE = ['angry', 'sad', 'sleepy', 'error', 'surprised'];

    // Mouth shapes are held for a while and need a clear change in loudness to switch,
    // otherwise the face flickers. Only three shapes are used while talking.
    const HOLD_MS = 170;
    const mouth = ref('m-closed');
    let lastSwitch = 0;
    let smooth = 0;

    function shapeFor(level, mood) {
        const open = mood === 'joy' ? 'm-laugh' : 'm-happy';
        if (level < 0.1) return 'm-closed';
        if (level < 0.3) return 'm-small';
        return open;
    }

    watch(mouthLevel, (v) => {
        smooth = smooth * 0.7 + v * 0.3;
        if (!isSpeaking.value) {
            mouth.value = 'm-closed';
            return;
        }
        const now = performance.now();
        if (now - lastSwitch < HOLD_MS) return;
        const mood = props.expression || emotion.value;
        const next = shapeFor(smooth, mood);
        if (next !== mouth.value) {
            mouth.value = next;
            lastSwitch = now;
        }
    });

    const src = computed(() => {
        const mood = props.expression || (props.reactive ? emotion.value : 'neutral');
        let wanted = mood;
        if (isSpeaking.value && !FIXED_FACE.includes(mood)) {
            wanted = mouth.value;
        }
        return bySlug[wanted] || bySlug[mood] || bySlug.neutral || icon;
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
    .aurora-mascot img {
        transition: opacity 0.08s linear;
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 22%;
        user-select: none;
    }
    .aurora-mascot.speaking {
        filter: drop-shadow(0 0 14px var(--aurora-pink, #ff7fb0));
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
    @media (prefers-reduced-motion: reduce) {
        .aurora-mascot.speaking {
            animation: none;
        }
    }
</style>
