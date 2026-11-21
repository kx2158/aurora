/**
 * Turns the body estimator's output into what VRChat takes over OSC, and builds the OSC packets.
 *
 * VRChat accepts a head plus up to 8 trackers (/tracking/trackers/1..8 and /tracking/trackers/head) and
 * works out which body part each one is from where it is when you calibrate. Eight is the most it takes,
 * which is exactly hips, chest, two knees, two feet and two elbows: the full 11 point setup together
 * with the head and the two hands VRChat already has. So there are no more joints to add for VRChat.
 *
 * Coordinates: SteamVR is right handed with -z forward, Unity (VRChat) is left handed with +z forward,
 * so positions flip z and rotations flip the sign of the x and y parts of the quaternion. Rotations go
 * out as Euler degrees. This mapping follows the VRChat OSC documentation but has not been checked
 * against a running VRChat yet.
 */

/** The tracker slots, in the order they are numbered. */
export const TRACKER_ORDER = ['hips', 'chest', 'leftFoot', 'rightFoot', 'leftKnee', 'rightKnee', 'leftElbow', 'rightElbow'];

export const toUnityPosition = (p) => [p[0], p[1], -p[2]];

/** Quaternion [x, y, z, w] from SteamVR space to Euler degrees [x, y, z] in Unity (ZXY order). */
export function toUnityEuler(q) {
    const [x, y, z, w] = [-q[0], -q[1], q[2], q[3]];
    // Unity rotates in Z, then X, then Y order
    const sinX = 2 * (w * x - y * z);
    let ex;
    let ey;
    let ez;
    if (Math.abs(sinX) < 0.9999999) {
        ex = Math.asin(sinX);
        ey = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
        ez = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));
    } else {
        ex = Math.sign(sinX) * Math.PI / 2;
        ey = Math.atan2(-2 * (x * z - w * y), 1 - 2 * (y * y + z * z));
        ez = 0;
    }
    const deg = (r) => {
        const d = (r * 180) / Math.PI;
        return Math.abs(d) < 1e-9 ? 0 : d;
    };
    return [deg(ex), deg(ey), deg(ez)];
}

/**
 * The messages for one frame: [{ address, values: [x, y, z] }]. Joints the estimator did not produce
 * (an arm without a hand) are left out, so VRChat keeps its own arm IK for those.
 */
export function buildTrackerMessages(body, head) {
    const messages = [];
    const add = (name, pose) => {
        if (!pose) return;
        messages.push({ address: `/tracking/trackers/${name}/position`, values: toUnityPosition(pose.pos) });
        messages.push({ address: `/tracking/trackers/${name}/rotation`, values: toUnityEuler(pose.rot) });
    };
    let slot = 0;
    for (const joint of TRACKER_ORDER) {
        const pose = body[joint];
        if (!pose) continue;
        slot += 1;
        add(String(slot), pose);
    }
    if (head) add('head', head);
    return messages;
}

// ---------- OSC encoding ----------

const pad4 = (n) => (n + 3) & ~3;

function oscString(text) {
    const bytes = new TextEncoder().encode(text);
    const out = new Uint8Array(pad4(bytes.length + 1));
    out.set(bytes);
    return out;
}

/** One OSC message with float arguments, as bytes ready to send over UDP. */
export function encodeOscMessage(address, values) {
    const addr = oscString(address);
    const tags = oscString(',' + 'f'.repeat(values.length));
    const out = new Uint8Array(addr.length + tags.length + values.length * 4);
    out.set(addr, 0);
    out.set(tags, addr.length);
    const view = new DataView(out.buffer);
    values.forEach((v, i) => view.setFloat32(addr.length + tags.length + i * 4, v, false));
    return out;
}

/** All of a frame's messages as one OSC bundle, so VRChat applies them together. */
export function encodeOscBundle(messages) {
    const parts = messages.map((m) => encodeOscMessage(m.address, m.values));
    const total = 16 + parts.reduce((n, p) => n + 4 + p.length, 0);
    const out = new Uint8Array(total);
    out.set(oscString('#bundle'), 0);
    const view = new DataView(out.buffer);
    view.setUint32(8, 0, false); // time tag: immediately
    view.setUint32(12, 1, false);
    let at = 16;
    for (const p of parts) {
        view.setInt32(at, p.length, false);
        out.set(p, at + 4);
        at += 4 + p.length;
    }
    return out;
}
