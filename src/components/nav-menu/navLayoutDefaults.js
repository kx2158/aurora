import { DASHBOARD_NAV_KEY_PREFIX } from '../../shared/constants';

export function createBaseDefaultNavLayout(t) {
    void t;
    // flat list, the sidebar draws section labels from each entry's section
    return [
        { type: 'item', key: 'home' },
        { type: 'item', key: 'feed' },
        { type: 'item', key: 'friends-locations' },
        { type: 'item', key: 'notification' },
        { type: 'item', key: 'search' },
        { type: 'item', key: 'friend-list' },
        { type: 'item', key: 'friend-log' },
        { type: 'item', key: 'favorite-friends' },
        { type: 'item', key: 'moderation' },
        { type: 'item', key: 'favorite-worlds' },
        { type: 'item', key: 'game-log' },
        { type: 'item', key: 'player-list' },
        { type: 'item', key: 'insights' },
        { type: 'item', key: 'charts-mutual' },
        { type: 'item', key: 'charts-instance' },
        { type: 'item', key: 'charts-hot-worlds' },
        { type: 'item', key: 'mic' },
        { type: 'item', key: 'chatbox' },
        { type: 'item', key: 'automations' },
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
