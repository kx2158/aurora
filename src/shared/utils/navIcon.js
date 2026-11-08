/** Sidebar icons are either a Remix icon class ('ri-...') or one of Aurora's own icons ('a:<name>'). */
export function isAuroraIcon(icon) {
    return typeof icon === 'string' && icon.startsWith('a:');
}

export function navIconClass(icon) {
    return isAuroraIcon(icon) ? '' : icon;
}

export function auroraIconName(icon) {
    return isAuroraIcon(icon) ? icon.slice(2) : '';
}
