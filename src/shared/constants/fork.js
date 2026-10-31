/**
 * Switches for this personal fork. Change them here.
 *
 * updaterEnabled: Aurora checks ITS OWN GitHub releases (kx2158/aurora, see
 *   src/shared/constants/settings.js) for new versions. It never contacts the original
 *   VRCX servers. Set to false to turn the updater off completely.
 * telemetryEnabled: when false the crash reporter (Sentry) is never started,
 *   even in nightly builds.
 *
 * The app name shown in window titles is set with:
 *   node build-scripts/set-app-name.js "Your Name"
 */
export const FORK = {
    updaterEnabled: true,
    telemetryEnabled: false
};
