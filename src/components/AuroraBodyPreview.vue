<template>
    <component :is="embedded ? 'div' : 'section'" :class="embedded ? 'prev-embedded' : 'a-card prev-card'">
        <div class="prev-bar">
            <div class="prev-segment" role="group" :aria-label="t('view.body_preview.title')">
                <button v-for="v in views" :key="v" type="button" :class="{ on: view === v }" @click="view = v">
                    {{ t(`view.body_preview.view_${v}`) }}
                </button>
            </div>
            <span class="flex-1"></span>
            <select v-model="motion" class="a-input prev-select" :aria-label="t('view.body_preview.motion')" @change="restart">
                <option v-for="m in motions" :key="m" :value="m">{{ t(`view.body_preview.motion_${m}`) }}</option>
            </select>
            <select v-model="look" class="a-input prev-select" :aria-label="t('view.body_preview.look')">
                <option value="theme">{{ t('view.body_preview.look_theme') }}</option>
                <option value="neon">{{ t('view.body_preview.look_neon') }}</option>
                <option value="clean">{{ t('view.body_preview.look_clean') }}</option>
            </select>
        </div>
        <canvas ref="canvas" class="prev-canvas" :aria-label="t('view.body_preview.title')" />
        <p class="a-note prev-note">{{ t('view.body_preview.desc') }}</p>
    </component>
</template>

<script setup>
    import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { PALETTES, drawAvatar, paletteFromTheme } from '../services/bodyAvatarRender';
    import { createBodyEstimator } from '../services/bodyEstimator';
    import { quatFromYaw } from '../services/footEstimator';
    import { calibration, estimatorOptions, initCalibration, sitMode, sittingInput } from '../services/auroraBodyCalibration';

    defineProps({ embedded: { type: Boolean, default: false } });

    const { t } = useI18n();
    const views = ['front', 'side', 'top'];
    const motions = ['walk', 'circle', 'bend', 'sit', 'wave'];
    const view = ref('front');
    const motion = ref('walk');
    const look = ref('theme');
    const canvas = ref(null);

    let body = null;
    let raf = 0;
    let clock = 0;
    let last = 0;

    const restart = () => {
        body = createBodyEstimator(estimatorOptions.value);
        clock = 0;
    };
    // a size, seat or leg change shows up at once
    watch(estimatorOptions, restart, { deep: true });
    watch(sitMode, () => {
        if (body) body.reset();
    });

    // the scripted head and hands for each demo motion, in the units of the calibrated body
    function input(time) {
        const e = calibration.value.eyeHeight;
        const k = e / 1.65; // everything below is written for a normal body and scaled by this
        let hx = 0;
        let hy = 1.65;
        let hz = 0;
        let yaw = 0;
        let virt;
        let wave = 0;
        let reach = false;
        if (motion.value === 'walk') virt = [0, 1.1];
        else if (motion.value === 'circle') {
            const a = (time * 1.1) / 1.6;
            hx = Math.cos(a) * 1.6;
            hz = Math.sin(a) * 1.6;
            yaw = Math.PI - a;
        } else if (motion.value === 'bend') {
            const q = (1 - Math.cos(time)) / 2;
            hz = -0.5 * q;
            hy = 1.65 - 0.42 * q;
            reach = true;
        } else if (motion.value === 'sit') {
            const c = time % 10;
            const q0 = Math.min(1, Math.max(0, c - 1)) - Math.min(1, Math.max(0, c - 6));
            const q = q0 * q0 * (3 - 2 * q0);
            // the hips end up on the seat, with the torso above it
            hy = 1.65 - (1.65 - 0.74 - calibration.value.seatHeight - 0.05) * q;
            hz = 0.1 * q;
        } else if (motion.value === 'wave') wave = 1;
        const hand = (ox, oy, oz) => ({ pos: [(hx + ox) * k, (hy + oy) * k, (hz - oz) * k], rot: quatFromYaw(yaw) });
        const w = wave ? Math.sin(time * 4) : 0;
        const lh = reach ? hand(-0.22, -0.5, 0.3) : hand(-0.28 - wave * 0.25, -0.55 + wave * (0.45 + w * 0.3), 0.3);
        const rh = reach ? hand(0.22, -0.5, 0.3) : hand(0.28 + wave * 0.25, -0.55 + wave * (0.45 - w * 0.3), 0.3);
        return {
            head: { pos: [hx * k, hy * k, hz * k], rot: quatFromYaw(yaw) },
            leftHand: lh,
            rightHand: rh,
            virtualVelocity: virt ? [virt[0] * k, virt[1] * k] : undefined,
            sitting: sittingInput()
        };
    }

    // Match theme: the Neon themes get the glowing look, the others the plain one in their accent colour
    function paletteAndStyle(el) {
        if (look.value === 'neon') return { palette: PALETTES.neon, style: 'neon' };
        if (look.value === 'clean') return { palette: PALETTES.clean, style: 'clean' };
        const theme = document.documentElement.getAttribute('data-theme') || '';
        const style = getComputedStyle(el);
        const isNeon = theme.startsWith('aurora');
        return { palette: paletteFromTheme((name) => style.getPropertyValue(name), isNeon ? PALETTES.neon : PALETTES.clean), style: isNeon ? 'neon' : 'clean' };
    }

    function paint(out, inp) {
        const el = canvas.value;
        if (!el) return;
        const dpr = window.devicePixelRatio || 1;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
            el.width = Math.round(w * dpr);
            el.height = Math.round(h * dpr);
        }
        const c = el.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const { palette, style } = paletteAndStyle(el);
        drawAvatar(c, { w, h, view: view.value, body: out, input: inp, palette, style, eye: calibration.value.eyeHeight });
    }

    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
        last = now;
        if (!body) restart();
        const steps = Math.max(1, Math.round(dt * 90));
        let out;
        let inp;
        for (let i = 0; i < steps; i++) {
            clock += dt / steps;
            inp = input(clock);
            out = body.update(inp, dt / steps);
        }
        paint(out, inp);
        raf = requestAnimationFrame(frame);
    }

    // stop drawing while the page is hidden
    const onVisibility = () => {
        cancelAnimationFrame(raf);
        if (!document.hidden) {
            last = performance.now();
            raf = requestAnimationFrame(frame);
        }
    };

    onMounted(async () => {
        await initCalibration();
        restart();
        raf = requestAnimationFrame(frame);
        document.addEventListener('visibilitychange', onVisibility);
    });
    onBeforeUnmount(() => {
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVisibility);
    });
</script>

<style scoped>
    .prev-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        flex-wrap: wrap;
    }
    .prev-segment {
        display: inline-flex;
        border: 1px solid var(--a-line);
        border-radius: 999px;
        padding: 3px;
        gap: 2px;
    }
    .prev-segment button {
        font-size: 0.78rem;
        padding: 3px 12px;
        border-radius: 999px;
        color: var(--a-muted);
    }
    .prev-segment button.on {
        background: color-mix(in oklch, var(--a-accent, #b4b4b4) 22%, transparent);
        color: var(--a-text);
    }
    .prev-select {
        width: auto;
        min-width: 0;
        font-size: 0.78rem;
    }
    .prev-canvas {
        width: 100%;
        height: 420px;
        border-radius: 14px;
        border: 1px solid var(--a-line, rgba(255, 255, 255, 0.08));
        background: #07060d;
        display: block;
    }
    .prev-note {
        margin: 8px 2px 0;
        font-size: 0.72rem;
    }
</style>
