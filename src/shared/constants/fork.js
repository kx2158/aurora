/**
 * Switches for this personal fork. Change them here.
 *
 * updaterEnabled: when false the app never asks the original VRCX servers for
 *   new versions and never offers to replace itself with stock VRCX.
 * telemetryEnabled: when false the crash reporter (Sentry) is never started,
 *   even in nightly builds.
 *
 * The app name shown in window titles is set with:
 *   node build-scripts/set-app-name.js "Your Name"
 */
export const FORK = {
    updaterEnabled: false,
    telemetryEnabled: false
};
