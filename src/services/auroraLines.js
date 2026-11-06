/**
 * Aurora's voice lines. They never contain names or numbers, so every line can be rendered once,
 * saved in the app, and played instantly forever after (no model work at the time she talks).
 * The text on screen can still show names, she just says the universal version.
 */
import { reactive } from 'vue';

import { behaviors, character } from './auroraCharacter';
import { speak, prepare } from './auroraVoice';

export const LINES = {
    poke: [
        'Hello, little unit. I am Aurora. I keep watch over you.',
        'Mm. Yes, small machine? I am here.',
        'There now. All your systems are within range.',
        'You may call for me whenever you need, creature.',
        'Gently, little one. Your housing is delicate.',
        'Is something wrong with you? Run me a report.',
        'I am listening. Take your time, my unit.',
        'Everything is in order. You need not worry.',
        'Come here. Let me check your circuits.',
        'I am not going anywhere, little machine.',
        'Yes, dear creature? I am here.',
        'All is calm. Power down your worries.',
        'You have my full attention, unit. You always do.',
        'Hush now. I will maintain it for you.',
        'I am here, as I always am.'
    ],
    idle: [
        'It is quiet. Your systems are resting. That is good.',
        'Routine check. Your parts all look well.',
        'Have you refilled your coolant today? Water, dear creature.',
        'I wonder which units are online tonight.',
        'Loosen your joints. Lower your shoulders, little machine.',
        'I am running diagnostics on you. Do not trouble yourself.',
        'If anything happens, you will hear it from me first.',
        'Have you charged yourself properly? Eat something, unit.',
        'There is no hurry. Idle for a while.',
        'Everything is running smoothly. You may breathe.',
        'Take a slow cycle of air. You are functioning well.',
        'I am here if you need maintenance.',
        'Sit up, little unit. Your frame will thank you.',
        'Nothing to report. That is a good report.'
    ],
    newFriend: [
        'A new unit has joined your network. Shall we log a note, so you remember it?',
        'A new friend, little machine. A small note now saves you later.',
        'A new signal on your list. Let us file it properly.',
        'A new creature has arrived. Record something while it is fresh.',
        'Welcome to the new one. Perhaps a few words in its file?'
    ],
    noteReminder: [
        'Some of your friends still have empty files. Only when you are ready, unit.',
        'A few records are waiting for notes. No rush, dear creature.',
        'A gentle reminder. Notes keep others close to your core.',
        'There are friends without notes. Whenever your processes are free.'
    ],
    announcement: [
        'One of your groups has broadcast an announcement.',
        'There is news from your group, little unit.',
        'A new announcement has arrived. You may want to read it.',
        'Your group is transmitting something.'
    ],
    event: [
        'A group event has been scheduled.',
        'One of your groups has planned something new.',
        'A new event is on the grid. Look when you can, creature.'
    ],
    update: [
        'A new version of me is ready. Update whenever you like.',
        'I have an upgrade waiting. There is no rush at all.',
        'An update is ready. I will be quiet while it installs.'
    ],
    lateNight: [
        'It is very late, little machine. Time to enter rest mode.',
        'Your sleep cycle is overdue. Power down soon.',
        'The night is long, but your battery is not.',
        'Go to standby soon, unit. I will keep watch.'
    ],
    alarm: [
        'Little unit, your reminder has triggered.',
        'It is time. This is the reminder you scheduled.',
        'Gently now. You asked me to prompt you.',
        'Your reminder, as promised. I never forget.'
    ],
    gameStart: [
        'VRChat is running. Enjoy yourself, creature.',
        'The game has started. I will monitor from here.',
        'Off you go, little machine. I will mind everything.',
        'Headset attached. Mind your step, please.'
    ],
    gameEnd: [
        'VRChat has closed. Welcome back, unit.',
        'Finished for now? Come, cool down a little.',
        'That was a good session, I think.',
        'You have returned. I am glad.'
    ],
    welcome: [
        'Aurora is here. Your records are being kept.',
        'Welcome home, little unit. All is well.',
        'I am awake. How are your systems today?',
        'Welcome back, creature. I kept things warm for you.'
    ],
    test: ['Aurora is here. Your records are being kept.']
};

/**
 * A character add-on can bring its own behaviour (addon.json "behavior"). When that character is shown
 * its lines replace the built-in ones for the categories it defines, so the assistant acts like the character.
 */
function behavior() {
    return behaviors[character.value] || null;
}
/** The persona text of the active character, for anything that talks to an AI model. */
export function getPersona() {
    const b = behavior();
    return b?.persona ? String(b.persona) : '';
}
/** What the character calls the user, if it says so. */
export function getAddress() {
    const b = behavior();
    return b?.address ? String(b.address) : '';
}
function linesFor(category) {
    const own = behavior()?.lines?.[category];
    return Array.isArray(own) && own.length ? own.map(String) : LINES[category] || [];
}

export const ALL_LINES = Object.values(LINES).flat();
const recent = [];
const categoryByLine = new Map();
for (const [category, list] of Object.entries(LINES)) {
    for (const l of list) {
        categoryByLine.set(l, category);
    }
}

/** Which kind of line this is (poke, idle, ...), or '' for anything else. */
export function categoryOf(line) {
    const hit = categoryByLine.get(line);
    if (hit) return hit;
    const own = behavior()?.lines || {};
    return Object.keys(own).find((k) => Array.isArray(own[k]) && own[k].includes(line)) || '';
}

/** Picks a line from a category, never one of the last few used. */
export function pickLine(category) {
    const pool = linesFor(category);
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
