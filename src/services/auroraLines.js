/**
 * Aurora's voice lines. They never contain names or numbers, so every line can be rendered once,
 * saved in the app, and played instantly forever after (no model work at the time she talks).
 * The text on screen can still show names, she just says the universal version.
 */
import { reactive } from 'vue';

import { speak, prepare } from './auroraVoice';

export const LINES = {
    poke: [
        'Hello, dear. I am Aurora. I keep a quiet eye on things for you.',
        'Mm. Yes? I am here.',
        'There now. I am still watching over your friends list.',
        'You can always call for me. I do not mind.',
        'Gently, please. But I am glad you are here.',
        'Is something the matter? Tell me.',
        'I am listening. Take your time.',
        'Everything is in order. You need not worry.',
        'Come here, sit a moment. I have things under control.',
        'I am not going anywhere.',
        'Yes, little one? I am here.',
        'All is calm. Rest easy.',
        'You have my attention. You always do.',
        'Hush now. I will look after it.',
        'I am here, as I always am.'
    ],
    idle: [
        'It is quiet. That is all right.',
        'Just checking on you. Everything looks calm.',
        'Have you had some water today? Please do.',
        'I wonder who is out there tonight.',
        'Soften your shoulders. There, that is better.',
        'I am watching over things. Do not trouble yourself.',
        'If anything happens, I will tell you first.',
        'Have you eaten properly? Do not forget yourself.',
        'There is no hurry. Take your time.',
        'Everything is running smoothly. You can breathe.',
        'Take a slow breath. You are doing well.',
        'I am here if you need me.',
        'Sit up a little, dear. Your back will thank you.',
        'Nothing to report. That is a good thing.'
    ],
    newFriend: [
        'Someone new has joined your list. Would you like to write a note, so you remember them?',
        'A new friend, dear. A small note now will help you later.',
        'You have a new face on your list. Shall we remember them properly?',
        'A new friend has arrived. Write something down while it is fresh.',
        'Welcome to the new one. Perhaps a few words about them?'
    ],
    noteReminder: [
        'A few of your friends still have no notes. Only when you are ready.',
        'Some friends are waiting for a note. No rush, dear.',
        'A gentle reminder. Notes keep people close.',
        'There are friends without notes. Whenever you have a moment.'
    ],
    announcement: [
        'One of your groups has posted an announcement.',
        'There is news from your group, dear.',
        'A new announcement has arrived. You may want to read it.',
        'Your group has something to say.'
    ],
    event: [
        'A group event has been made.',
        'One of your groups has planned something new.',
        'There is a new event. Have a look when you can.'
    ],
    update: [
        'A new version of me is ready. Update whenever you like.',
        'I have an update waiting. There is no rush at all.',
        'An update is ready. I will be good while it settles in.'
    ],
    lateNight: [
        'It is very late, dear. Rest now.',
        'It is past your bedtime. Sleep well.',
        'The night is long, but you need your rest.',
        'Go to bed soon. I will keep watch.'
    ],
    alarm: [
        'Dear, your reminder is here.',
        'It is time. This is the reminder you asked for.',
        'Gently now. You asked me to remind you.',
        'Your reminder, as promised. I never forget.'
    ],
    gameStart: [
        'VRChat is open. Enjoy yourself, dear.',
        'The game has started. I will keep watch from here.',
        'Off you go. I will mind everything.',
        'Headset on. Mind your step, please.'
    ],
    gameEnd: [
        'VRChat has closed. Welcome back, dear.',
        'Finished for now? Come, rest a little.',
        'That was a good session, I think.',
        'You are back. I am glad.'
    ],
    welcome: [
        'Aurora is here. Everything is being tracked.',
        'Welcome home, dear. All is well.',
        'I am awake. How are you feeling today?',
        'Welcome back. I kept things warm for you.'
    ],
    test: ['Aurora is here. Everything is being tracked.']
};

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
    return categoryByLine.get(line) || '';
}

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
