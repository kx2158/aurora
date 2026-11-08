# Aurora developer guide

This is for anyone who forks Aurora and wants to add features or restyle it. Aurora is a fork of VRCX (MIT), so everything in VRCX still works the same way. This guide covers what Aurora added on top.

## 1. Get it running

- Front end: Vue 3, Pinia, Tailwind 4, shadcn-vue, vue-i18n. `npm install`, then `npm run dev` for a browser preview (the C# side is missing there, so anything that calls `AppApi.*` does nothing).
- Windows app: C# with CefSharp (`Dotnet/VRCX-Cef.csproj`). Electron shell: `src-electron/` plus `Dotnet/VRCX-Electron.csproj`. Both share the `Dotnet/AppApi` folder.
- Real builds happen in GitHub Actions: `.github/workflows/aurora-windows.yml` (manual run, "Run workflow"). It builds the UI, the app and the NSIS installer `Aurora_Setup_x64.exe` and publishes a release. The in-app updater reads that release.
- The app only runs on Windows. A green build proves it compiles, not that it works, so test on a PC.

## 2. Where things live

| What | Where |
| --- | --- |
| Sidebar entries, icons and sections | `src/shared/constants/ui.js` (`navDefinitions`, `navSections`), order in `src/components/nav-menu/navLayoutDefaults.js` |
| Aurora's icon set | `src/shared/constants/auroraIcons.js`, drawn by `src/components/AuroraIcon.vue` |
| Logo | `src/components/AuroraLogo.vue`, `images/aurora/logo.svg`, app icons `images/Neon.ico` / `Neon.png` |
| Aurora pages | `src/views/Home`, `Mic`, `Insights`, `Automations`, `Chatbox` |
| Page building blocks (cards, rows, sliders, toggles) | `src/styles/aurora-pages.css` (`a-page`, `a-card`, `a-field`, `a-btn`...) |
| Aurora services (logic, no UI) | `src/services/aurora*.js` |
| Aurora settings (accent, PIN, cleanup) | `src/views/Settings/components/Tabs/AuroraTab.vue`, store `src/stores/settings/aurora.js` |
| VR wrist panel and SteamVR dashboard | `src/vr/` (UI) and `Dotnet/Overlay/` (native) |
| Windows only C# features | `Dotnet/AppApi/Cef/*.cs` (stubs for Electron in `Dotnet/AppApi/Electron/`) |
| Themes | `src/styles/themes/*.css`, registry `src/shared/constants/themes.js` |
| Shared look layers | `src/styles/xray.css` (Aurora) and `src/styles/aurora-ui.css` (Neon) |
| Browser preview with fake data | `tools/preview/` (used by `.github/workflows/check.yml` for screenshots) |
| Installer | `Installer/installer.nsi` |
| Texts and translations | `src/localization/en.json` (other locales fall back to English) |

Some names still say Neon or VRCX on purpose (config keys like `Neon_accent`, `VRCX_ThemeMode`, the data folder `%APPDATA%\Neon`, file names such as `Neon.sqlite3`, the `vrcx://` protocol, `AppApi` methods like `NeonMusicMicStart`). They keep old data working. Do not rename them unless you also write a migration.

## 3. Add a setting

1. Add the value and a setter to `src/stores/settings/aurora.js`. Read it in `load()` with `configRepository.getString/getBool/getInt('Aurora_yourKey', default)` and write it with `configRepository.setString(...)` in the setter.
2. Show it in `AuroraTab.vue` inside a `SettingsGroup`, using `SettingsItem` with a `Switch`, `Slider`, `Select` or `Input`. Destructure the value with `storeToRefs(store)` and the setter from `store`.
3. Add the label text to `src/localization/en.json` under `view.settings.aurora`.

If the feature has no store, a small service with its own `ref` and a `configRepository` key (see `src/services/auroraAccent.js`) is fine.

## 4. Add a feature with logic

Make a service in `src/services/auroraYourThing.js`, export reactive state and functions, and call its `init...()` from `src/App.vue` next to `initMusicMic()` and friends. To tell the user something, call `pushNews({ kind, title, text })` from `src/services/auroraNews.js` (alarms pop up as a notice) or use `toast` from `vue-sonner`.

React to VRChat events from the coordinators in `src/coordinators/` (for example `gameLogCoordinator.js` for joins and leaves, `friendPresenceCoordinator.js` for friends going online) and to notifications in `src/stores/notification/index.js`. `src/services/auroraStatusRules.js` shows the pattern.

## 5. Add a page

1. Create `src/views/YourPage/YourPage.vue`. Start from `src/views/Automations/Automations.vue`: an `a-page` with an `a-head` and `a-card`s.
2. Add a route in `src/plugins/router.js`.
3. Add a nav entry in `src/shared/constants/ui.js` with an icon (`icon: 'a:<name>'` from `auroraIcons.js`, or a Remix icon class) and a `section`, then place it in `src/components/nav-menu/navLayoutDefaults.js`.
4. Existing users keep their saved sidebar. To push a new layout to everyone once, change the migration flag in `src/components/nav-menu/composables/useNavLayout.js` (`Aurora_navV3`).
5. Check it in the browser preview: push to a `wip/...` branch and the Check workflow posts screenshots of every page.

## 6. Add a Windows (C#) feature

1. Add a public method to the partial class `AppApi` in a new file under `Dotnet/AppApi/Cef/`. JavaScript calls it as `AppApi.YourMethod(args)`. Return strings (use JSON for structured data) or simple types.
2. Add an empty stub with the same signature in `Dotnet/AppApi/Electron/`, otherwise the Electron build breaks.
3. Typings: `src/types/globals.d.ts` lists the AppApi methods.
4. Long running or audio work belongs on its own thread (see `NeonMusicMic.cs`: audio objects need a multi-threaded apartment).

## 7. Themes and colour

- Aurora Light, Aurora Dark: ids `xray` and `xraydark`. Colours are tokens in `src/styles/themes/xray.css` and `xray-dark.css`; the shared look (flat sheet, sidebar, controls, notices) is `src/styles/xray.css`.
- Neon, Neon Light: ids `aurora` and `auroralight`, the old pink cyberpunk look, in `aurora.css`, `aurora-light.css` and `aurora-ui.css`.
- Add a theme: write `src/styles/themes/yours.css` scoped to `:root[data-theme='yours']`, then register it in `THEME_CONFIG` in `src/shared/constants/themes.js` and add a `theme_mode_yours` label in `en.json`.
- The accent colour is one value (`src/services/auroraAccent.js`). It sets `--axh` (hue) and `--axk` (0 for grayscale) for Aurora themes, `--aurora-pink` for Neon, and colours the VR panels. Edit `ACCENT_PRESETS` to change the swatches.
- Charts read their colours from the theme at runtime (`readColors()` in `src/views/Insights/Insights.vue`), so they follow light, dark and the accent.

## 8. Icons and logo

- Icons are plain SVG paths on a 24 grid with a 1.6 stroke. Add one to `AURORA_ICONS` and use it with `<AuroraIcon name="..." />` or `icon: 'a:...'` in the sidebar.
- The logo is a planet rim with an aurora ribbon in front (`AuroraLogo.vue`). The app and tray icons are PNG/ICO renders of it in `images/`.

## 9. Insights

`src/services/auroraInsights.js` reads the local database (game log, friend feed, friend log) and returns plain arrays; `src/views/Insights/Insights.vue` draws them with ECharts through the small `AChart.vue` wrapper. To add a chart, add the numbers to `loadInsights()` and a `computed` option plus an `<AChart>` card on the page.

## 10. Mic

Mixes one app's sound with your microphone into a virtual cable (VB-Cable or similar). Code: `src/services/auroraMusicMic.js`, the page `src/views/Mic/Mic.vue` and `Dotnet/AppApi/Cef/NeonMusicMic.cs` (NAudio, WASAPI process loopback). Chain for the voice: noise suppression (`NoiseSuppressor`: 512-point STFT, learned noise floor, Wiener gain, soft gate, about 11 ms of delay), bass boost (low shelf plus saturation), volume. A soft limiter on the mix stops hard clipping. It starts and stops with VRChat when "Start with VRChat" is on (`watchGameForMic`).

## 11. Data and safety

- The database is the VRCX SQLite file, now `Neon.sqlite3` in `%APPDATA%\Neon`. A daily copy is made to `Documents\Neon-backups\auto` (`src/services/auroraBackup.js`, keeps 30).
- `Dotnet/Program.cs` moves an old `%APPDATA%\VRCX` folder over and renames old file names on startup. If you change folder or file names, write the migration first and keep a backup step in the installer.
- The installer (`Installer/installer.nsi`) replaces an old VRCX or Neon install and never touches the data folder.
- Do not add auto-kick, bulk moderation or other automation of VRChat actions. It can get accounts banned.

## 12. Rules of thumb

- Keep `Neon_*`, `Aurora_*` and `VRCX_*` config keys stable.
- Every `AppApi` method needs an Electron stub.
- New texts go in `en.json` (`view.mic`, `view.insights`, `view.automations`, `nav_aurora`...); missing keys fall back to English.
- Test on Windows. Check the log at `%APPDATA%\Neon\logs\Neon.log` when something crashes.

> AI assistants: see CLAUDE.md before helping with a fork.
