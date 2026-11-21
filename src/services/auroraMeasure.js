/**
 * Measure a height with a controller: touch the floor, then touch the spot you want to measure
 * (a bed, a chair, your eyes), and the difference in height is the answer.
 * Positions come from SteamVR through the overlay (see SendPoses in VRCXVRCef.cs), 10 times a second.
 * The controller's tracked point sits a few centimeters above its tip, so expect the floor reading to be a bit high.
 */
import { reactive } from 'vue';

import { runCalibration, setManual } from './auroraBodyCalibration';
import { freshPoses, wantPoses, waitForPoses } from './auroraPoses';

export const measure = reactive({
    hand: 'right',
    /** idle | wait (counting down) | done | failed */
    status: 'idle',
    step: '',
    floorY: null,
    meters: null,
    message: ''
});

const handKey = () => (measure.hand === 'left' ? 'leftHand' : 'rightHand');
let busy = false;

/** Counts down so you can get the controller in place, then averages half a second of its height. */
async function capture(seconds = 3) {
    measure.status = 'wait';
    // Aurora switches the VR overlay on for this, which can take a few seconds
    if (!(await waitForPoses())) return null;
    await new Promise((r) => setTimeout(r, seconds * 1000));
    const ys = [];
    const end = Date.now() + 500;
    while (Date.now() < end) {
        const pose = freshPoses()?.[handKey()];
        if (pose?.pos) ys.push(pose.pos[1]);
        await new Promise((r) => setTimeout(r, 50));
    }
    if (ys.length < 3) return null;
    ys.sort((a, b) => a - b);
    // the controller has to be still
    if (ys[ys.length - 1] - ys[0] > 0.03) return 'moving';
    return ys[Math.floor(ys.length / 2)];
}

async function run(step) {
    if (busy) return;
    busy = true;
    wantPoses('measure', true);
    measure.step = step;
    measure.message = '';
    try {
        const y = await capture();
        if (y === null) {
            measure.status = 'failed';
            measure.message = 'no_controller';
        } else if (y === 'moving') {
            measure.status = 'failed';
            measure.message = 'moving';
        } else if (step === 'floor') {
            measure.floorY = y;
            measure.meters = null;
            measure.status = 'done';
        } else if (measure.floorY === null) {
            measure.status = 'failed';
            measure.message = 'no_floor';
        } else if (y - measure.floorY < 0.02) {
            measure.status = 'failed';
            measure.message = 'too_low';
        } else {
            measure.meters = y - measure.floorY;
            measure.status = 'done';
        }
    } finally {
        busy = false;
        wantPoses('measure', false);
    }
}

export const measureFloor = () => run('floor');
export const measurePoint = () => run('point');

export function setMeasureHand(hand) {
    if (hand === 'left' || hand === 'right') measure.hand = hand;
}

/** Use the measured height as the seat height (bed, chair) or as the eye height. */
export function applyMeasure(target) {
    if (measure.meters === null) return false;
    setManual(target === 'eye' ? { eyeHeight: measure.meters } : { seatHeight: measure.meters });
    return true;
}

/** Calibrate button: switches the overlay on, waits for poses, then runs the calibration. */
export async function calibrateNow(options) {
    wantPoses('calibrate', true);
    try {
        await waitForPoses();
        return await runCalibration(options);
    } finally {
        wantPoses('calibrate', false);
    }
}
