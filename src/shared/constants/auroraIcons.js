/**
 * Aurora's own icon set: thin line icons on a 24 x 24 grid, drawn with a 1.6 stroke and round ends.
 * Each icon is a list of SVG paths, circles ([cx, cy, r]) and filled dots ([cx, cy, r]).
 * Use them with <AuroraIcon name="..." />, or in the sidebar with icon: 'a:<name>'.
 */
export const AURORA_ICONS = {
    dot: { dots: [[12, 12, 2]] },

    // places
    home: { paths: ['M4 10.5 12 4l8 6.5', 'M6 9v10.5h12V9', 'M10 19.5v-5h4v5'] },
    feed: {
        paths: ['M9 6.5h11', 'M9 12h11', 'M9 17.5h7'],
        dots: [
            [4.8, 6.5, 1.3],
            [4.8, 12, 1.3],
            [4.8, 17.5, 1.3]
        ]
    },
    friends: {
        paths: ['M12 21s-6-5.6-6-10.4A6 6 0 0 1 18 10.6C18 15.4 12 21 12 21Z'],
        circles: [[12, 10.5, 2.3]]
    },
    bell: {
        paths: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z', 'M10 20.5a2 2 0 0 0 4 0']
    },
    search: { paths: ['m20 20-4.2-4.2'], circles: [[10.5, 10.5, 6]] },

    // people
    people: {
        paths: ['M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8', 'M15.5 14.4c2.5.2 4.4 1.9 5 4.6'],
        circles: [
            [9, 8.5, 3.2],
            [16, 8.2, 2.6]
        ]
    },
    history: {
        paths: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 4.5V8H7', 'M12 7.5V12l3 2']
    },
    heart: {
        paths: ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20Z']
    },
    shield: {
        paths: ['M12 3.5 19 6v5.6c0 4.4-3 7.6-7 8.9-4-1.3-7-4.5-7-8.9V6Z', 'm9.5 12 1.8 1.8 3.4-3.6']
    },

    // worlds and sessions
    globe: {
        paths: ['M3.5 12h17', 'M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5Z'],
        circles: [[12, 12, 8.5]]
    },
    log: {
        paths: ['M6 3.5h9l3 3v14H6Z', 'M9 10h6', 'M9 13.5h6', 'M9 17h3.5']
    },
    instance: {
        paths: ['M4 6.5h16v11H4Z', 'M8 20.5h8'],
        dots: [
            [9, 12, 1.2],
            [12, 12, 1.2],
            [15, 12, 1.2]
        ]
    },

    // insights
    chart: { paths: ['M4 20.5h16', 'M6.5 17V12', 'M11 17V7', 'M15.5 17v-7', 'M20 17v-3.5'] },
    network: {
        paths: ['M7 7.2 10.6 10.6', 'M13.4 10.6 17 7', 'M12 14v3.6', 'M10.4 13.3 6.4 16.2'],
        circles: [
            [5.5, 5.8, 2.2],
            [18.5, 5.6, 2.2],
            [12, 12, 2.3],
            [12, 19.6, 1.9],
            [5, 17.8, 1.9]
        ]
    },
    sessions: { paths: ['M4 6.5h9', 'M8 12h12', 'M4 17.5h6', 'M15 17.5h5'] },
    flame: {
        paths: ['M12 21c3.6 0 6-2.4 6-5.8 0-4.4-3.8-6.3-4.6-11.2-2.9 2-4.1 4.4-4.2 6.8-1-.6-1.6-1.6-1.8-2.8C6.2 9.6 6 11.4 6 13.2 6 17.8 8.4 21 12 21Z']
    },

    // Aurora tools
    mic: {
        paths: ['M9 6.5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0Z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5v3']
    },
    chat: {
        paths: ['M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h0a2 2 0 0 1-2-2Z', 'M8.5 9.5h7', 'M8.5 12.5h4']
    },
    bolt: { paths: ['M13 3.5 5.5 13.5H12l-1 7 7.5-10H12Z'] },
    tool: { paths: ['M4.5 4.5h6v6h-6Z', 'M13.5 4.5h6v6h-6Z', 'M4.5 13.5h6v6h-6Z', 'M13.5 13.5h6v6h-6Z'] },
    command: {
        paths: ['M9 9V6.5A2.5 2.5 0 1 0 6.5 9H17.5A2.5 2.5 0 1 0 15 6.5v11a2.5 2.5 0 1 0 2.5-2.5h-11A2.5 2.5 0 1 0 9 17.5Z']
    },
    settings: {
        paths: [
            'M10.3 3.5h3.4l.6 2.4 1.7 1 2.4-.7 1.7 3-1.8 1.7v2l1.8 1.7-1.7 3-2.4-.7-1.7 1-.6 2.4h-3.4l-.6-2.4-1.7-1-2.4.7-1.7-3L5.5 13v-2L3.7 9.3l1.7-3 2.4.7 1.7-1Z'
        ],
        circles: [[12, 12, 2.6]]
    },
    dashboard: { paths: ['M4 4h7v9H4Z', 'M13 4h7v5h-7Z', 'M13 11h7v9h-7Z', 'M4 15h7v5H4Z'] },
    sidebar: { paths: ['M4 5h16v14H4Z', 'M9.5 5v14'] },

    // small helpers used inside pages
    power: { paths: ['M12 3.5V11', 'M7 6.4a7.5 7.5 0 1 0 10 0'] },
    music: {
        paths: ['M9 17.5V5.5l10-2v12'],
        circles: [
            [6.8, 17.5, 2.2],
            [16.8, 15.5, 2.2]
        ]
    },
    speaker: { paths: ['M4 9.5h3.5L12 5.5v13l-4.5-4H4Z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11'] },
    mute: { paths: ['M4 9.5h3.5L12 5.5v13l-4.5-4H4Z', 'm16 9.5 5 5', 'm21 9.5-5 5'] },
    wave: { paths: ['M3 12h2l2-5 3 10 3-13 3 13 2-5h3'] },
    refresh: { paths: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v3.8h-3.8'] },
    alarm: {
        paths: ['M12 9v4l2.5 1.5', 'M5 4 3 6', 'm19 4 2 2'],
        circles: [[12, 13, 7]]
    },
    status: { circles: [[12, 12, 8]], dots: [[12, 12, 3.2]] },
    plus: { paths: ['M12 5v14', 'M5 12h14'] },
    minus: { paths: ['M5 12h14'] },
    moon: { paths: ['M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z'] },
    prev: { paths: ['M18 6v12l-9-6Z', 'M6 6v12'] },
    next: { paths: ['M6 6v12l9-6Z', 'M18 6v12'] },
    playpause: { paths: ['M5 6v12l8-6Z', 'M16 6.5v11', 'M19.5 6.5v11'] },
    close: { paths: ['m6 6 12 12', 'M18 6 6 18'] },
    arrow: { paths: ['M5 12h14', 'm13 6 6 6-6 6'] }
};
