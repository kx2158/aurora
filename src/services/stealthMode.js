/**
 * Stealth mode: for the days you do not want to be bothered. Turning it on hides your profile,
 * turning it off puts it back exactly as it was.
 *
 * On:  status text and pronouns cleared, bio and bio links cleared, banner and profile icon cleared,
 *      language tags removed, every group set to hidden, every favourites group set to private,
 *      every badge hidden.
 * Off: everything above restored from a snapshot taken right before it was hidden, including
 *      the group you represent (hiding a group drops it, so it is set again after the group is visible).
 *
 * What it cannot do: change your avatar, your account age, your trust rank or your friends list.
 * Each part is its own step, so if VRChat refuses one, the others still go through and the
 * result lists what failed. The snapshot is saved before anything changes, so turning stealth off
 * still works after a restart. Everything stays on this machine.
 */
import { ref } from 'vue';
import { toast } from 'vue-sonner';

import { favoriteRequest, groupRequest, miscRequest, userRequest } from '../api';
import { useFavoriteStore } from '../stores/favorite';
import { useGroupStore } from '../stores/group';
import { useUserStore } from '../stores/user';
import configRepository from './config';
import { needsHiding, runSteps } from './stealthSteps';

const KEY = 'Aurora_stealth';

/** { on: boolean, at: number, saved: object|null } */
export const stealth = ref({ on: false, at: 0, saved: null });
export const stealthBusy = ref(false);
/** What failed in the last switch, for the settings page: [{ step, error }] */
export const stealthFailures = ref([]);
let loaded = false;

export async function initStealth() {
    if (loaded) return;
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(KEY, ''));
        if (saved && typeof saved === 'object') stealth.value = { on: Boolean(saved.on), at: saved.at || 0, saved: saved.saved || null };
    } catch {
        // never used
    }
}

async function persist() {
    await configRepository.setString(KEY, JSON.stringify(stealth.value));
}

function languageTags(tags) {
    return (tags || []).filter((t) => String(t).startsWith('language_'));
}

async function takeSnapshot() {
    const user = useUserStore().currentUser;
    const profile = (await userRequest.getSelfProfile()).json;
    // the group you represent, asked from VRChat directly because the local copy can be stale
    let representedId = '';
    try {
        const rep = (await groupRequest.getRepresentedGroup({ userId: user.id })).json;
        if (rep?.groupId || rep?.id) representedId = rep.groupId || rep.id;
    } catch {
        // fall back to what the group list says
    }
    const groups = [...useGroupStore().currentUserGroups.values()].map((g) => ({
        id: g.id,
        visibility: g.myMember?.visibility || 'visible',
        isRepresenting: representedId ? g.id === representedId : Boolean(g.myMember?.isRepresenting)
    }));
    const fav = useFavoriteStore();
    const favGroups = [...fav.favoriteFriendGroups, ...fav.favoriteWorldGroups, ...fav.favoriteAvatarGroups]
        .filter((g) => g.visibility && g.name)
        .map((g) => ({ type: g.type, name: g.name, visibility: g.visibility }));
    return {
        statusDescription: user.statusDescription || '',
        pronouns: user.pronouns || '',
        profilePicOverride: user.profilePicOverride || '',
        languages: languageTags(user.tags),
        bio: profile.bio || '',
        bioLinks: Array.isArray(profile.bioLinks) ? profile.bioLinks.slice() : [],
        bannerType: profile.bannerType || 'color',
        bannerColor: profile.bannerColor || '',
        bannerUrl: profile.bannerUrl || '',
        userIcon: profile.iconUrl ?? profile.userIcon ?? '',
        groups,
        favGroups,
        badges: (user.badges || []).map((b) => ({ badgeId: b.badgeId, hidden: Boolean(b.hidden), showcased: Boolean(b.showcased) }))
    };
}

function hideSteps(s) {
    const userId = useUserStore().currentUser.id;
    const steps = [
        { name: 'status text and pronouns', run: () => userRequest.saveCurrentUser({ statusDescription: '', pronouns: '' }) },
        {
            name: 'bio and banner',
            run: () =>
                userRequest.saveProfile({ bio: '', bioLinks: [], bannerType: 'color', userIcon: '' })
        },
        { name: 'profile picture', run: () => (s.profilePicOverride ? userRequest.saveCurrentUser({ profilePicOverride: '' }) : null) }
    ];
    if (s.languages.length) {
        steps.push({ name: 'languages', run: () => userRequest.removeUserTags({ tags: s.languages }) });
    }
    for (const g of needsHiding(s.groups, (x) => x.visibility === 'hidden')) {
        steps.push({ name: `group ${g.id}`, run: () => groupRequest.setGroupMemberProps(userId, g.id, { visibility: 'hidden' }) });
    }
    for (const g of needsHiding(s.favGroups, (x) => x.visibility === 'private')) {
        steps.push({
            name: `favourites ${g.name}`,
            run: () => favoriteRequest.saveFavoriteGroup({ type: g.type, group: g.name, visibility: 'private' })
        });
    }
    for (const b of needsHiding(s.badges, (x) => x.hidden && !x.showcased)) {
        steps.push({ name: `badge ${b.badgeId}`, run: () => miscRequest.updateBadge({ badgeId: b.badgeId, hidden: true, showcased: false }) });
    }
    return steps;
}

function restoreSteps(s) {
    const userId = useUserStore().currentUser.id;
    const steps = [
        { name: 'status text and pronouns', run: () => userRequest.saveCurrentUser({ statusDescription: s.statusDescription, pronouns: s.pronouns }) },
        {
            name: 'bio and banner',
            run: () => {
                const payload = { bio: s.bio, bioLinks: s.bioLinks, bannerType: s.bannerType, userIcon: s.userIcon };
                if (s.bannerType === 'color') payload.bannerColor = s.bannerColor;
                if (s.bannerType === 'customImage') payload.bannerCustomUrl = s.bannerUrl;
                return userRequest.saveProfile(payload);
            }
        },
        { name: 'profile picture', run: () => (s.profilePicOverride ? userRequest.saveCurrentUser({ profilePicOverride: s.profilePicOverride }) : null) }
    ];
    if (s.languages.length) {
        steps.push({ name: 'languages', run: () => userRequest.addUserTags({ tags: s.languages }) });
    }
    for (const g of s.groups) {
        if (g.visibility !== 'hidden') {
            steps.push({ name: `group ${g.id}`, run: () => groupRequest.setGroupMemberProps(userId, g.id, { visibility: g.visibility }) });
        }
    }
    // last of the group steps: representing only works once the group is visible again
    const represented = s.groups.find((g) => g.isRepresenting);
    if (represented) {
        steps.push({
            name: `represented group ${represented.id}`,
            run: () => groupRequest.setGroupRepresentation(represented.id, { isRepresenting: true })
        });
    }
    for (const g of s.favGroups) {
        if (g.visibility !== 'private') {
            steps.push({
                name: `favourites ${g.name}`,
                run: () => favoriteRequest.saveFavoriteGroup({ type: g.type, group: g.name, visibility: g.visibility })
            });
        }
    }
    for (const b of s.badges) {
        if (!b.hidden || b.showcased) {
            steps.push({ name: `badge ${b.badgeId}`, run: () => miscRequest.updateBadge({ badgeId: b.badgeId, hidden: b.hidden, showcased: b.showcased }) });
        }
    }
    return steps;
}

/**
 * @param {boolean} on
 */
export async function setStealth(on) {
    await initStealth();
    if (stealthBusy.value || stealth.value.on === Boolean(on)) return;
    stealthBusy.value = true;
    stealthFailures.value = [];
    try {
        if (on) {
            const saved = await takeSnapshot();
            // the snapshot is on disk before the first thing is hidden
            stealth.value = { on: true, at: Date.now(), saved };
            await persist();
            stealthFailures.value = await runSteps(hideSteps(saved));
        } else {
            const saved = stealth.value.saved;
            if (saved) stealthFailures.value = await runSteps(restoreSteps(saved));
            // keep the snapshot if something could not be restored, so nothing is lost
            stealth.value = stealthFailures.value.length ? { ...stealth.value, on: false } : { on: false, at: 0, saved: null };
            await persist();
        }
        if (stealthFailures.value.length) {
            toast.warning(`${on ? 'Stealth on' : 'Stealth off'}, but ${stealthFailures.value.length} step(s) failed`);
        } else {
            toast.success(on ? 'Stealth mode on' : 'Stealth mode off, profile restored');
        }
    } finally {
        stealthBusy.value = false;
    }
}
