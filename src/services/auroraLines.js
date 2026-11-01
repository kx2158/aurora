/**
 * Neon's voice lines. They never contain names or numbers, so every line can be rendered once,
 * saved in the app, and played instantly forever after (no model work at the time she talks).
 * The text on screen can still show names, she just says the universal version.
 */
import { reactive } from 'vue';

import { speak, prepare } from './auroraVoice';

export const LINES = {
    poke: [
        'Hey! I am Neon. I float around and keep an eye on things.',
        'Careful, that tickles. Need something?',
        'Still here, still watching your friends list.',
        'Click me again and I will start charging rent.',
        'You rang?',
        'Yes? I was busy being decorative.',
        'I am not a button. Okay, I am a little bit a button.',
        'Poke me one more time. I dare you.',
        'Systems are fine. I am fine. Everything is fine.',
        'Need a hand? I do not have hands, but I have opinions.',
        'Oh hi. I was just thinking about nothing.',
        'You have my full attention. For about four seconds.',
        'Tell me something good.',
        'Boop received. Boop returned.',
        'I am on duty. Unofficially.'
    ],
    idle: [
        'It is quiet. I like quiet.',
        'Just checking in. All systems look good.',
        'Did you drink some water today? Asking for a friend. The friend is me.',
        'I wonder who is online right now.',
        'Remember to stretch. Your spine says hi.',
        'Neon is watching. Lovingly. Mostly.',
        'If something happens, I will let you know.',
        'I could use a snack. Do bytes count?',
        'Low battery on my patience. Kidding.',
        'Everything is running smoothly. Suspicious.',
        'Fun fact. I do not blink. Okay, I blink a little.',
        'Take a breath. You are doing fine.',
        'I am here if you need me.',
        'Posture check. Shoulders down.',
        'Nothing to report. That is the best kind of report.'
    ],
    newFriend: [
        'You have a new friend. Want to write a note so you remember them?',
        'Someone new joined your list. A note might help later.',
        'New friend detected. Do not forget to add a note.',
        'A fresh face on your friends list. Add a note while it is fresh.',
        'Welcome to the new friend. Want to jot something down about them?'
    ],
    noteReminder: [
        'Still some friends without notes. Want to fix that?',
        'A few of your friends have no notes yet.',
        'Little reminder. Notes make future you very happy.',
        'You never wrote notes for some friends. Today is a good day.'
    ],
    announcement: [
        'One of your groups posted an announcement.',
        'New announcement. Might be worth a look.',
        'Your group has some news.',
        'Announcement incoming.'
    ],
    event: [
        'A group event was just created.',
        'There is a new event from one of your groups.',
        'New group event. Check your calendar.'
    ],
    update: [
        'A new version of Neon is ready. Update whenever you like.',
        'I have an update waiting. A better me, if you let me.',
        'Update available. I will behave while it installs.'
    ],
    lateNight: [
        'It is very late. Sleep is also a feature.',
        'Past bedtime, I think. Just saying.',
        'The night is long, but your eyes are not unlimited.'
    ],
    alarm: [
        'Hey. Your reminder is going off.',
        'Time is up. This is your reminder.',
        'Beep beep. You asked me to nudge you.',
        'Reminder time. I did not forget, I never forget.'
    ],
    gameStart: [
        'VRChat is up. Have fun out there.',
        'Game detected. I will keep watch from here.',
        'Off you go. I will hold the fort.',
        'Headset time. Try not to walk into a wall.'
    ],
    gameEnd: [
        'VRChat closed. Welcome back to the real world.',
        'Done for now? I will keep tracking.',
        'That was a good session. I think.',
        'Back on the desktop. I missed you.'
    ],
    welcome: [
        'Neon online. Tracking is running.',
        'Good to see you. Systems are up.',
        'I am awake. What are we doing today?',
        'Welcome back. I kept things warm.'
    ],
    test: ['Neon online. Tracking is running.']
};

export const ALL_LINES = Object.values(LINES).flat();
const recent = [];

/** Picks a line from a category, never one of the last few used. */
export function pickLine(category) {
    const pool = LINES[category] || [];
    const fresh = pool.filter((l) => !recent.includes(l));
    const from = fresh.length ? fresh : pool;
    const line = from[Math.floor(Math.random() * from.length)] || '';
    recent.push(line);
    while (recent.length > 12) {
        recent.shift();
    }
    return line;
}

// ---------- the voice pack: render everything once, quietly, then keep it ----------
export const pack = reactive({ done: 0, total: ALL_LINES.length, running: false });
let stopRequested = false;

export function stopPack() {
    stopRequested = true;
}

/**
 * Renders every line one at a time. canRun() lets the caller pause it (for example while VRChat runs)
 * and onProgress gets (done, total).
 */
export async function buildVoicePack(opts, { canRun = () => true, onProgress = () => {} } = {}) {
    if (pack.running) {
        return;
    }
    pack.running = true;
    stopRequested = false;
    pack.done = 0;
    try {
        for (const line of ALL_LINES) {
            while (!canRun() && !stopRequested) {
                await new Promise((r) => setTimeout(r, 15000)); // wait until it is a good moment
            }
            if (stopRequested) {
                break;
            }
            await prepare(line, opts); // instant if it was rendered before
            pack.done++;
            onProgress(pack.done, pack.total);
            await new Promise((r) => setTimeout(r, 400)); // breathe, keeps the CPU calm
        }
    } finally {
        pack.running = false;
    }
}

export { speak };
