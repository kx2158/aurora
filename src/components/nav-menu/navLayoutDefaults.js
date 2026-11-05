import { DASHBOARD_NAV_KEY_PREFIX } from '../../shared/constants';

export function createBaseDefaultNavLayout(t) {
    return [
        { type: 'item', key: 'home' },
        { type: 'item', key: 'neon' },
        { type: 'item', key: 'chatbox' },
        { type: 'item', key: 'friends-locations' },
        { type: 'item', key: 'feed' },
        { type: 'item', key: 'notification' },
        {
            type: 'folder',
            id: 'default-folder-more',
            nameKey: 'nav_tooltip.more',
            name: t('nav_tooltip.more'),
            icon: 'ri-apps-2-line',
            items: [
                'game-log',
                'player-list',
                'search',
                'favorite-friends',
                'favorite-worlds',
                'favorite-avatars',
                'friend-log',
                'friend-list',
                'moderation',
                'my-avatars',
                'charts-instance',
                'charts-mutual',
                'charts-hot-worlds'
            ]
        },
        { type: 'item', key: 'tools' },
        { type: 'item', key: 'direct-access' }
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
