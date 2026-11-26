import { DASHBOARD_NAV_KEY_PREFIX } from '../../shared/constants';

export function createBaseDefaultNavLayout(t) {
    // flat list, the sidebar draws the group labels (Social, History, Live, Accounts) from each entry's section.
    // The Tools page is gone from here: every tool sits in the group it belongs to, the rare ones in "More tools".
    const item = (key) => ({ type: 'item', key });
    return [
        item('home'),

        // Social
        item('feed'),
        item('friends-locations'),
        item('notification'),
        item('friend-list'),
        item('friend-log'),
        item('favorite-friends'),
        item('moderation'),
        item('favorite-worlds'),
        item('tool-people-search'),
        item('tool-group-calendar'),
        item('tool-group-invites'),
        item('tool-blocked-groups'),

        // History
        item('game-log'),
        item('tool-location-calendar'),
        item('player-list'),
        item('insights'),
        item('charts-mutual'),
        item('charts-instance'),
        item('charts-hot-worlds'),
        item('tool-gallery'),
        item('tool-screenshot-metadata'),

        // Live
        item('mic'),
        item('chatbox'),
        item('stickers'),
        item('automations'),
        item('modules'),

        // Accounts & more
        item('tool-account-sync'),
        item('tool-avatar-hider'),
        item('tool-auto-change-status'),
        {
            type: 'folder',
            id: 'default-folder-more-tools',
            nameKey: 'nav_aurora.more_tools',
            name: t('nav_aurora.more_tools'),
            icon: 'ri-apps-line',
            items: [
                'tool-vrc-photos',
                'tool-steam-screenshots',
                'tool-vrcx-data',
                'tool-vrchat-data',
                'tool-crash-dumps',
                'tool-vrchat-config',
                'tool-launch-options',
                'tool-registry-backup',
                'tool-discord-names',
                'tool-export-notes',
                'tool-export-friend-list',
                'tool-export-own-avatars',
                'tool-edit-invite-message',
                'tool-moderation-reports',
                'tool-purchase-history',
                'tool-info-push'
            ]
        }
    ];
}

export function insertDashboardEntries(layout, dashboardDefinitions) {
    const nextLayout = Array.isArray(layout) ? [...layout] : [];
    const dashboardEntries = (dashboardDefinitions || []).map((def) => ({
        type: 'item',
        key: def.key
    }));

    if (!dashboardEntries.length) {
        return nextLayout;
    }

    const directAccessIdx = nextLayout.findIndex((entry) => entry.type === 'item' && entry.key === 'direct-access');

    if (directAccessIdx !== -1) {
        nextLayout.splice(directAccessIdx, 0, ...dashboardEntries);
    } else {
        nextLayout.push(...dashboardEntries);
    }

    return nextLayout;
}

export function isDashboardNavKey(key) {
    return String(key || '').startsWith(DASHBOARD_NAV_KEY_PREFIX);
}
