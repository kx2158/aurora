/**
 * Draws the estimated body as a stylised mannequin on a 2D canvas: tapered limbs, a torso, a head,
 * hands and feet, in a plain or a glowing neon look. No dependencies, so Aurora's preview and the
 * standalone test page share it.
 *
 *   drawAvatar(ctx, { w, h, view: 'front' | 'side' | 'top', body, input, palette, style, trails })
 *
 * body is what createBodyEstimator().update() returns, input is the head and hands that went in.
 */

export const PALETTES = {
    neon: {
        bg: '#07060d',
        floor: '#b57bff',
        grid: '#2a1f45',
        left: '#ff4fa3',
        right: '#38e1ff',
        core: '#b57bff',
        head: '#ffffff',
        hand: '#ffffff',
        text: '#c9bff2'
    },
    clean: {
        bg: '#0a0b0f',
        floor: '#3a3f4d',
        grid: '#1b1e27',
        left: '#ff7aa8',
        right: '#6ec6ff',
        core: '#b9a7ff',
        head: '#f2f2f6',
        hand: '#ffffff',
        text: '#8a8f9c'
    }
};

/** A palette from Aurora's theme colours (CSS custom properties), falling back to the neon one. */
export function paletteFromTheme(read, base = PALETTES.neon) {
    const v = (name, fallback) => {
        const x = read(name);
        return x && String(x).trim() ? String(x).trim() : fallback;
    };
    return { ...base, core: v('--a-accent', base.core), floor: v('--a-accent', base.floor), text: v('--a-muted', base.text) };
}

// ---------- small vector helpers ----------

const fwdOf = (yaw) => [-Math.sin(yaw), 0, -Math.cos(yaw)];
const rgtOf = (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

function rotate(q, v) {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---------- the body as a list of parts ----------

/**
 * Everything that gets drawn, in world coordinates (meters): capsules between two points with a radius
 * at each end, and balls. Returned with a colour role so the style can colour them.
 */
export function buildParts(body, input, eye = 1.65) {
    const k = eye / 1.65;
    const yaw = body.bodyYaw;
    const rg = rgtOf(yaw);
    const fw = fwdOf(yaw);
    const up = [0, 1, 0];
    const parts = [];
    const cap = (role, a, b, ra, rb) => parts.push({ type: 'cap', role, a, b, ra: ra * k, rb: rb * k });
    const ball = (role, p, r) => parts.push({ type: 'ball', role, p, r: r * k });
    const joints = [];

    const hips = body.hips.pos;
    const chest = body.chest.pos;
    const chestUp = rotate(body.chest.rot, up);
    const headPos = input.head.pos;
    const headUp = rotate(input.head.rot, up);
    const headCenter = add3(headPos, mul3(headUp, -0.05 * k));
    const shoulderCenter = add3(chest, mul3(chestUp, 0.13 * k));
    const shoulderHalf = 0.19 * k;
    const shL = body.leftElbow ? body.leftElbow.shoulder : add3(shoulderCenter, mul3(rg, -shoulderHalf));
    const shR = body.rightElbow ? body.rightElbow.shoulder : add3(shoulderCenter, mul3(rg, shoulderHalf));
    const hipHalf = 0.09 * k;
    const hipL = add3(hips, mul3(rg, -hipHalf));
    const hipR = add3(hips, mul3(rg, hipHalf));

    // torso: pelvis, belly, chest, shoulders, neck
    cap('core', hipL, hipR, 0.085, 0.085);
    cap('core', hips, chest, 0.1, 0.125);
    cap('core', chest, shoulderCenter, 0.125, 0.11);
    cap('core', shL, shR, 0.048, 0.048);
    cap('core', shoulderCenter, add3(headCenter, mul3(headUp, -0.08 * k)), 0.04, 0.036);
    ball('head', headCenter, 0.098);

    // legs
    for (const side of ['left', 'right']) {
        const hj = side === 'left' ? hipL : hipR;
        const knee = body[side + 'Knee'].pos;
        const foot = body[side + 'Foot'];
        const ankle = add3(foot.pos, [0, 0.075 * k, 0]);
        const f = foot.rot ? rotate(foot.rot, [0, 0, -1]) : fwdOf(foot.yaw !== undefined ? foot.yaw : yaw);
        const toe = add3(foot.pos, add3(mul3(f, 0.17 * k), [0, 0.02 * k, 0]));
        const heel = add3(foot.pos, add3(mul3(f, -0.06 * k), [0, 0.03 * k, 0]));
        cap(side, hj, knee, 0.078, 0.056);
        cap(side, knee, ankle, 0.056, 0.04);
        cap(side, heel, toe, 0.035, 0.028);
        ball(side, knee, 0.058);
        joints.push({ role: side, p: knee, r: 0.02 }, { role: side, p: foot.pos, r: 0.018 });
    }

    // arms
    for (const side of ['left', 'right']) {
        const el = body[side + 'Elbow'];
        const hand = input[side + 'Hand'];
        if (!el || !hand) continue;
        cap(side, el.shoulder, el.pos, 0.047, 0.039);
        cap(side, el.pos, hand.pos, 0.039, 0.03);
        ball(side, el.pos, 0.04);
        ball('hand', hand.pos, 0.034);
        joints.push({ role: side, p: el.pos, r: 0.018 });
    }
    joints.push({ role: 'core', p: hips, r: 0.024 }, { role: 'core', p: chest, r: 0.022 });
    return { parts, joints, headCenter, fw, rg };
}

// ---------- drawing ----------

function capsulePath(c, p1, r1, p2, r2) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const d = Math.hypot(dx, dy);
    c.beginPath();
    if (d < Math.abs(r1 - r2) + 0.5) {
        const big = r1 >= r2 ? [p1, r1] : [p2, r2];
        c.arc(big[0][0], big[0][1], big[1], 0, Math.PI * 2);
        return;
    }
    const a = Math.atan2(dy, dx);
    const beta = Math.acos((r1 - r2) / d);
    c.arc(p1[0], p1[1], r1, a + beta, a - beta + Math.PI * 2, false);
    c.arc(p2[0], p2[1], r2, a - beta, a + beta, false);
    c.closePath();
}

export function drawAvatar(c, o) {
    const { w, h, view, body, input, style = 'neon', trails } = o;
    const pal = o.palette || PALETTES[style] || PALETTES.neon;
    const neon = style === 'neon';
    const eye = o.eye || 1.65;
    const colorOf = (role) => (role === 'left' ? pal.left : role === 'right' ? pal.right : role === 'head' ? pal.head : role === 'hand' ? pal.hand : pal.core);

    c.save();
    c.clearRect(0, 0, w, h);
    // background
    const bg = c.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    bg.addColorStop(0, neon ? '#120d22' : '#10121a');
    bg.addColorStop(1, pal.bg);
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    const hipsPos = body.hips.pos;
    const cx = hipsPos[0];
    const cz = hipsPos[2];
    const ppm = view === 'top' ? Math.min(w, h) / 2.3 : h / 2.25;
    const rgv = rgtOf(body.bodyYaw);
    const fwv = fwdOf(body.bodyYaw);
    const floorY = h - 26;
    let map;
    if (view === 'top') map = (p) => [w / 2 + (p[0] - cx) * ppm, h / 2 + (p[2] - cz) * ppm];
    else if (view === 'front') map = (p) => [w / 2 + ((p[0] - cx) * rgv[0] + (p[2] - cz) * rgv[2]) * ppm, floorY - p[1] * ppm];
    else map = (p) => [w / 2 + ((p[0] - cx) * fwv[0] + (p[2] - cz) * fwv[2]) * ppm, floorY - p[1] * ppm];
    const depthOf = (p) => (view === 'front' ? (p[0] - cx) * fwv[0] + (p[2] - cz) * fwv[2] : view === 'side' ? (p[0] - cx) * rgv[0] + (p[2] - cz) * rgv[2] : p[1]);

    // floor
    if (view === 'top') {
        c.strokeStyle = pal.grid;
        c.lineWidth = 1;
        for (let g = -2; g <= 2; g += 0.5) {
            const a = map([cx + g, 0, cz]);
            const b = map([cx, 0, cz + g]);
            c.beginPath();
            c.moveTo(a[0], 0);
            c.lineTo(a[0], h);
            c.moveTo(0, b[1]);
            c.lineTo(w, b[1]);
            c.stroke();
        }
    } else {
        const fl = c.createLinearGradient(0, floorY - 2, 0, h);
        fl.addColorStop(0, neon ? rgba(pal.floor, 0.28) : rgba(pal.floor, 0.35));
        fl.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = fl;
        c.fillRect(0, floorY, w, h - floorY);
        c.strokeStyle = neon ? rgba(pal.floor, 0.9) : pal.floor;
        c.lineWidth = neon ? 1.5 : 1;
        if (neon) {
            c.shadowColor = pal.floor;
            c.shadowBlur = 12;
        }
        c.beginPath();
        c.moveTo(0, floorY);
        c.lineTo(w, floorY);
        c.stroke();
        c.shadowBlur = 0;
        // soft contact shadow under the body
        const sh = c.createRadialGradient(w / 2, floorY, 2, w / 2, floorY, ppm * 0.45);
        sh.addColorStop(0, 'rgba(0,0,0,0.45)');
        sh.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sh;
        c.fillRect(0, floorY - 8, w, 16);
    }

    // footstep trails (top view)
    if (view === 'top' && trails) {
        for (const [tr, col] of [[trails.left, pal.left], [trails.right, pal.right]]) {
            if (!tr) continue;
            tr.forEach((p, i) => {
                const q = map(p);
                c.fillStyle = rgba(col, 0.12 + 0.4 * (i / tr.length));
                c.beginPath();
                c.arc(q[0], q[1], 2.2, 0, Math.PI * 2);
                c.fill();
            });
        }
    }

    const built = buildParts(body, input, eye);
    const parts = built.parts
        .map((p) => ({ ...p, z: depthOf(p.type === 'cap' ? mul3(add3(p.a, p.b), 0.5) : p.p) }))
        .sort((a, b) => a.z - b.z);

    c.lineJoin = 'round';
    for (const p of parts) {
        const col = colorOf(p.role);
        if (p.type === 'cap') {
            const a = map(p.a);
            const b = map(p.b);
            capsulePath(c, a, p.ra * ppm, b, p.rb * ppm);
            if (neon) {
                c.fillStyle = rgba(col, 0.1);
                c.fill();
                c.strokeStyle = col;
                c.lineWidth = 1.6;
                c.shadowColor = col;
                c.shadowBlur = 14;
                c.stroke();
                c.shadowBlur = 0;
            } else {
                const g = c.createLinearGradient(a[0] - p.ra * ppm, a[1], a[0] + p.ra * ppm, b[1]);
                g.addColorStop(0, rgba(col, 0.95));
                g.addColorStop(1, rgba(col, 0.55));
                c.fillStyle = g;
                c.fill();
                c.strokeStyle = 'rgba(0,0,0,0.35)';
                c.lineWidth = 1;
                c.stroke();
            }
        } else {
            const q = map(p.p);
            const r = p.r * ppm;
            c.beginPath();
            c.arc(q[0], q[1], r, 0, Math.PI * 2);
            if (neon) {
                c.fillStyle = rgba(col, p.role === 'head' ? 0.16 : 0.12);
                c.fill();
                c.strokeStyle = col;
                c.lineWidth = p.role === 'head' ? 2 : 1.4;
                c.shadowColor = col;
                c.shadowBlur = p.role === 'head' ? 18 : 12;
                c.stroke();
                c.shadowBlur = 0;
            } else {
                const g = c.createRadialGradient(q[0] - r * 0.35, q[1] - r * 0.35, r * 0.1, q[0], q[1], r);
                g.addColorStop(0, '#ffffff');
                g.addColorStop(1, rgba(col, p.role === 'head' ? 0.9 : 0.75));
                c.fillStyle = g;
                c.fill();
                c.strokeStyle = 'rgba(0,0,0,0.35)';
                c.lineWidth = 1;
                c.stroke();
            }
        }
    }

    // glowing joint markers on top
    for (const j of built.joints) {
        const q = map(j.p);
        const col = colorOf(j.role);
        c.beginPath();
        c.arc(q[0], q[1], Math.max(2.5, j.r * ppm), 0, Math.PI * 2);
        c.fillStyle = neon ? '#fff' : col;
        if (neon) {
            c.shadowColor = col;
            c.shadowBlur = 10;
        }
        c.fill();
        c.shadowBlur = 0;
    }

    // which way the face looks
    const hc = map(built.headCenter);
    const look = rotate(input.head.rot, [0, 0, -1]);
    const lk = view === 'top' ? [look[0], look[2]] : view === 'front' ? [(look[0] * rgv[0] + look[2] * rgv[2]), -look[1]] : [(look[0] * fwv[0] + look[2] * fwv[2]), -look[1]];
    const ll = Math.hypot(lk[0], lk[1]) || 1;
    c.strokeStyle = neon ? '#ffffff' : 'rgba(255,255,255,0.8)';
    c.lineWidth = 2;
    if (neon) {
        c.shadowColor = '#fff';
        c.shadowBlur = 8;
    }
    c.beginPath();
    c.moveTo(hc[0], hc[1]);
    c.lineTo(hc[0] + (lk[0] / ll) * 0.14 * ppm, hc[1] + (lk[1] / ll) * 0.14 * ppm);
    c.stroke();
    c.restore();
}
