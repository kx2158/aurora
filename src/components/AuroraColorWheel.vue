<template>
    <div class="cw">
        <div
            ref="wheel"
            class="cw-wheel"
            role="slider"
            tabindex="0"
            :aria-label="label"
            :aria-valuetext="modelValue"
            :style="{ width: size + 'px', height: size + 'px' }"
            @pointerdown="start"
            @keydown="nudge">
            <span class="cw-mark" :style="markStyle"></span>
        </div>
        <div class="cw-side">
            <span class="cw-swatch" :style="{ background: modelValue }"></span>
            <input
                class="a-input cw-hex"
                :value="hexText"
                maxlength="7"
                spellcheck="false"
                :aria-label="label"
                @input="onHex" />
        </div>
    </div>
</template>

<script setup>
    import { computed, ref, watch } from 'vue';

    /**
     * A colour wheel: the angle picks the hue, the distance from the middle how strong the colour is
     * (the middle is white). Brightness is left to the theme, so the colour stays readable everywhere.
     */
    const props = defineProps({
        modelValue: { type: String, required: true },
        size: { type: Number, default: 168 },
        label: { type: String, default: 'Colour' }
    });
    const emit = defineEmits(['update:modelValue']);

    const wheel = ref(null);
    const hexText = ref(props.modelValue);
    watch(
        () => props.modelValue,
        (v) => (hexText.value = v)
    );

    function hexToHsv(hex) {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        const n = m ? parseInt(m[1], 16) : 0xffffff;
        const r = ((n >> 16) & 255) / 255;
        const g = ((n >> 8) & 255) / 255;
        const b = (n & 255) / 255;
        const max = Math.max(r, g, b);
        const d = max - Math.min(r, g, b);
        let h = 0;
        if (d) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
        }
        return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
    }

    function hsvToHex(h, s, v) {
        const f = (n) => {
            const k = (n + h / 60) % 6;
            return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
        };
        return (
            '#' +
            [f(5), f(3), f(1)]
                .map((x) =>
                    Math.round(x * 255)
                        .toString(16)
                        .padStart(2, '0')
                )
                .join('')
        );
    }

    // the wheel is drawn with red at the top, going clockwise
    const markStyle = computed(() => {
        const { h, s } = hexToHsv(props.modelValue);
        const a = ((h - 90) * Math.PI) / 180;
        const r = s * 50;
        return {
            left: `${50 + r * Math.cos(a)}%`,
            top: `${50 + r * Math.sin(a)}%`,
            background: props.modelValue
        };
    });

    function pick(e) {
        const box = wheel.value.getBoundingClientRect();
        const x = e.clientX - (box.left + box.width / 2);
        const y = e.clientY - (box.top + box.height / 2);
        const s = Math.min(1, Math.hypot(x, y) / (box.width / 2));
        const h = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
        emit('update:modelValue', hsvToHex(h, s, 1));
    }

    function start(e) {
        pick(e);
        const move = (ev) => pick(ev);
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    function nudge(e) {
        const { h, s } = hexToHsv(props.modelValue);
        const step = e.shiftKey ? 15 : 3;
        let nh = h;
        let ns = s;
        if (e.key === 'ArrowRight') nh = (h + step) % 360;
        else if (e.key === 'ArrowLeft') nh = (h - step + 360) % 360;
        else if (e.key === 'ArrowUp') ns = Math.min(1, s + 0.05);
        else if (e.key === 'ArrowDown') ns = Math.max(0, s - 0.05);
        else return;
        e.preventDefault();
        emit('update:modelValue', hsvToHex(nh, ns, 1));
    }

    function onHex(e) {
        let v = e.target.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        hexText.value = v;
        if (/^#[0-9a-f]{6}$/i.test(v)) {
            emit('update:modelValue', v.toLowerCase());
        }
    }
</script>

<style scoped>
    .cw {
        display: flex;
        align-items: center;
        gap: 18px;
    }
    .cw-wheel {
        position: relative;
        flex: none;
        border-radius: 50%;
        cursor: crosshair;
        touch-action: none;
        background:
            radial-gradient(circle closest-side, #fff, rgba(255, 255, 255, 0) 100%),
            conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
        box-shadow: 0 0 0 1px var(--a-line, rgba(127, 127, 127, 0.2));
        outline: none;
    }
    .cw-wheel:focus-visible {
        box-shadow: 0 0 0 3px color-mix(in oklch, var(--foreground) 40%, transparent);
    }
    .cw-mark {
        position: absolute;
        width: 18px;
        height: 18px;
        margin: -9px 0 0 -9px;
        border-radius: 50%;
        border: 3px solid #fff;
        box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.35),
            0 2px 6px rgba(0, 0, 0, 0.35);
        pointer-events: none;
    }
    .cw-side {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .cw-swatch {
        width: 56px;
        height: 56px;
        border-radius: 14px;
        box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.25);
    }
    .cw-hex {
        width: 96px;
        font-family: var(--xr-mono, ui-monospace, monospace);
        text-transform: lowercase;
    }
</style>
