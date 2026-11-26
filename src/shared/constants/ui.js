import { toolNavDefinitions } from './tools';

/**
 * Sidebar entries. icon 'a:<name>' uses Aurora's own icon set (shared/constants/auroraIcons.js).
 * section groups entries under a small label in the sidebar.
 */
const navDefinitions = [
    {
        key: 'aura-now',
        icon: 'a:instance',
        tooltip: 'nav_aurora.now',
        labelKey: 'nav_aurora.now',
        routeName: 'aura-now',
        section: ''
    },
    {
        key: 'aura-people',
        icon: 'a:people',
        tooltip: 'nav_aurora.circle',
        labelKey: 'nav_aurora.circle',
        routeName: 'aura-people',
        section: ''
    },
    {
        key: 'home',
        icon: 'a:home',
        tooltip: 'nav_aurora.home',
        labelKey: 'nav_aurora.home',
        routeName: 'home',
        section: ''
    },
    {
        key: 'feed',
        icon: 'a:feed',
        tooltip: 'nav_aurora.feed',
        labelKey: 'nav_aurora.feed',
        routeName: 'feed',
        section: 'social'
    },
    {
        key: 'friends-locations',
        icon: 'a:friends',
        tooltip: 'nav_aurora.friends',
        labelKey: 'nav_aurora.friends',
        routeName: 'friends-locations',
        section: 'social'
    },
    {
        key: 'notification',
        icon: 'a:bell',
        tooltip: 'nav_aurora.notifications',
        labelKey: 'nav_aurora.notifications',
        routeName: 'notification',
        section: 'social'
    },
    {
        key: 'search',
        icon: 'a:search',
        tooltip: 'nav_aurora.search',
        labelKey: 'nav_aurora.search',
        routeName: 'search',
        section: 'social'
    },
    {
        key: 'friend-list',
        icon: 'a:people',
        tooltip: 'nav_aurora.friend_list',
        labelKey: 'nav_aurora.friend_list',
        routeName: 'friend-list',
        section: 'social'
    },
    {
        key: 'friend-log',
        icon: 'a:history',
        tooltip: 'nav_aurora.friend_log',
        labelKey: 'nav_aurora.friend_log',
        routeName: 'friend-log',
        section: 'social'
    },
    {
        key: 'favorite-friends',
        icon: 'a:heart',
        tooltip: 'nav_aurora.favorite_friends',
        labelKey: 'nav_aurora.favorite_friends',
        routeName: 'favorite-friends',
        section: 'social'
    },
    {
        key: 'moderation',
        icon: 'a:shield',
        tooltip: 'nav_aurora.moderation',
        labelKey: 'nav_aurora.moderation',
        routeName: 'moderation',
        section: 'social'
    },
    {
        key: 'favorite-worlds',
        icon: 'a:globe',
        tooltip: 'nav_aurora.favorite_worlds',
        labelKey: 'nav_aurora.favorite_worlds',
        routeName: 'favorite-worlds',
        section: 'social'
    },
    {
        key: 'game-log',
        icon: 'a:log',
        tooltip: 'nav_aurora.game_log',
        labelKey: 'nav_aurora.game_log',
        routeName: 'game-log',
        section: 'history'
    },
    {
        key: 'player-list',
        icon: 'a:instance',
        tooltip: 'nav_aurora.player_list',
        labelKey: 'nav_aurora.player_list',
        routeName: 'player-list',
        section: 'history'
    },
    {
        key: 'friends-manager',
        icon: 'a:people',
        tooltip: 'nav_aurora.friends_manager',
        labelKey: 'nav_aurora.friends_manager',
        routeName: 'friends-manager',
        section: 'social'
    },
    {
        key: 'insights',
        icon: 'a:chart',
        tooltip: 'nav_aurora.insights',
        labelKey: 'nav_aurora.insights',
        routeName: 'insights',
        section: 'history'
    },
    {
        key: 'charts-mutual',
        icon: 'a:network',
        tooltip: 'nav_aurora.network',
        labelKey: 'nav_aurora.network',
        routeName: 'charts-mutual',
        section: 'history'
    },
    {
        key: 'charts-instance',
        icon: 'a:sessions',
        tooltip: 'nav_aurora.sessions',
        labelKey: 'nav_aurora.sessions',
        routeName: 'charts-instance',
        section: 'history'
    },
    {
        key: 'charts-hot-worlds',
        icon: 'a:flame',
        tooltip: 'nav_aurora.hot_worlds',
        labelKey: 'nav_aurora.hot_worlds',
        routeName: 'charts-hot-worlds',
        section: 'history'
    },
    {
        key: 'mic',
        icon: 'a:mic',
        tooltip: 'nav_aurora.mic',
        labelKey: 'nav_aurora.mic',
        routeName: 'mic',
        section: 'live'
    },
    {
        key: 'chatbox',
        icon: 'a:chat',
        tooltip: 'nav_aurora.chatbox',
        labelKey: 'nav_aurora.chatbox',
        routeName: 'chatbox',
        section: 'live'
    },
    {
        key: 'stickers',
        icon: 'a:sticker',
        tooltip: 'nav_aurora.stickers',
        labelKey: 'nav_aurora.stickers',
        routeName: 'stickers',
        section: 'live'
    },
    {
        key: 'emoji',
        icon: 'a:emoji',
        tooltip: 'nav_aurora.emoji',
        labelKey: 'nav_aurora.emoji',
        routeName: 'emoji',
        section: 'live'
    },
    {
        key: 'automations',
        icon: 'a:bolt',
        tooltip: 'nav_aurora.automations',
        labelKey: 'nav_aurora.automations',
        routeName: 'automations',
        section: 'live'
    },
    {
        key: 'modules',
        icon: 'a:puzzle',
        tooltip: 'nav_aurora.modules',
        labelKey: 'nav_aurora.modules',
        routeName: 'modules',
        section: 'live'
    },
    {
        key: 'tools',
        icon: 'a:tool',
        tooltip: 'nav_aurora.tools',
        labelKey: 'nav_aurora.tools',
        routeName: 'tools',
        section: 'accounts'
    },
    {
        key: 'direct-access',
        icon: 'a:command',
        tooltip: 'nav_aurora.direct_access',
        labelKey: 'nav_aurora.direct_access',
        action: 'direct-access',
        section: 'accounts'
    },
    ...toolNavDefinitions
];

/** The order of sidebar sections and their labels. */
const navSections = {
    '': '',
    social: 'nav_aurora.section_social',
    history: 'nav_aurora.section_history',
    live: 'nav_aurora.section_live',
    accounts: 'nav_aurora.section_accounts',
    // kept so layouts and entries that still use the old group names keep their label
    aurora: 'nav_aurora.section_aurora',
    people: 'nav_aurora.section_people',
    worlds: 'nav_aurora.section_worlds',
    insights: 'nav_aurora.section_insights'
};

export { navDefinitions, navSections };
