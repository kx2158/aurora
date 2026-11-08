import { toolNavDefinitions } from './tools';

/**
 * Sidebar entries. icon 'a:<name>' uses Aurora's own icon set (shared/constants/auroraIcons.js).
 * section groups entries under a small label in the sidebar.
 */
const navDefinitions = [
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
        section: ''
    },
    {
        key: 'friends-locations',
        icon: 'a:friends',
        tooltip: 'nav_aurora.friends',
        labelKey: 'nav_aurora.friends',
        routeName: 'friends-locations',
        section: ''
    },
    {
        key: 'notification',
        icon: 'a:bell',
        tooltip: 'nav_aurora.notifications',
        labelKey: 'nav_aurora.notifications',
        routeName: 'notification',
        section: ''
    },
    {
        key: 'search',
        icon: 'a:search',
        tooltip: 'nav_aurora.search',
        labelKey: 'nav_aurora.search',
        routeName: 'search',
        section: ''
    },
    {
        key: 'friend-list',
        icon: 'a:people',
        tooltip: 'nav_aurora.friend_list',
        labelKey: 'nav_aurora.friend_list',
        routeName: 'friend-list',
        section: 'people'
    },
    {
        key: 'friend-log',
        icon: 'a:history',
        tooltip: 'nav_aurora.friend_log',
        labelKey: 'nav_aurora.friend_log',
        routeName: 'friend-log',
        section: 'people'
    },
    {
        key: 'favorite-friends',
        icon: 'a:heart',
        tooltip: 'nav_aurora.favorite_friends',
        labelKey: 'nav_aurora.favorite_friends',
        routeName: 'favorite-friends',
        section: 'people'
    },
    {
        key: 'moderation',
        icon: 'a:shield',
        tooltip: 'nav_aurora.moderation',
        labelKey: 'nav_aurora.moderation',
        routeName: 'moderation',
        section: 'people'
    },
    {
        key: 'favorite-worlds',
        icon: 'a:globe',
        tooltip: 'nav_aurora.favorite_worlds',
        labelKey: 'nav_aurora.favorite_worlds',
        routeName: 'favorite-worlds',
        section: 'worlds'
    },
    {
        key: 'game-log',
        icon: 'a:log',
        tooltip: 'nav_aurora.game_log',
        labelKey: 'nav_aurora.game_log',
        routeName: 'game-log',
        section: 'worlds'
    },
    {
        key: 'player-list',
        icon: 'a:instance',
        tooltip: 'nav_aurora.player_list',
        labelKey: 'nav_aurora.player_list',
        routeName: 'player-list',
        section: 'worlds'
    },
    {
        key: 'insights',
        icon: 'a:chart',
        tooltip: 'nav_aurora.insights',
        labelKey: 'nav_aurora.insights',
        routeName: 'insights',
        section: 'insights'
    },
    {
        key: 'charts-mutual',
        icon: 'a:network',
        tooltip: 'nav_aurora.network',
        labelKey: 'nav_aurora.network',
        routeName: 'charts-mutual',
        section: 'insights'
    },
    {
        key: 'charts-instance',
        icon: 'a:sessions',
        tooltip: 'nav_aurora.sessions',
        labelKey: 'nav_aurora.sessions',
        routeName: 'charts-instance',
        section: 'insights'
    },
    {
        key: 'charts-hot-worlds',
        icon: 'a:flame',
        tooltip: 'nav_aurora.hot_worlds',
        labelKey: 'nav_aurora.hot_worlds',
        routeName: 'charts-hot-worlds',
        section: 'insights'
    },
    {
        key: 'mic',
        icon: 'a:mic',
        tooltip: 'nav_aurora.mic',
        labelKey: 'nav_aurora.mic',
        routeName: 'mic',
        section: 'aurora'
    },
    {
        key: 'chatbox',
        icon: 'a:chat',
        tooltip: 'nav_aurora.chatbox',
        labelKey: 'nav_aurora.chatbox',
        routeName: 'chatbox',
        section: 'aurora'
    },
    {
        key: 'automations',
        icon: 'a:bolt',
        tooltip: 'nav_aurora.automations',
        labelKey: 'nav_aurora.automations',
        routeName: 'automations',
        section: 'aurora'
    },
    {
        key: 'tools',
        icon: 'a:tool',
        tooltip: 'nav_aurora.tools',
        labelKey: 'nav_aurora.tools',
        routeName: 'tools',
        section: 'aurora'
    },
    {
        key: 'direct-access',
        icon: 'a:command',
        tooltip: 'nav_aurora.direct_access',
        labelKey: 'nav_aurora.direct_access',
        action: 'direct-access',
        section: 'aurora'
    },
    ...toolNavDefinitions
];

/** The order of sidebar sections and their labels. */
const navSections = {
    '': '',
    aurora: 'nav_aurora.section_aurora',
    people: 'nav_aurora.section_people',
    worlds: 'nav_aurora.section_worlds',
    insights: 'nav_aurora.section_insights'
};

export { navDefinitions, navSections };
