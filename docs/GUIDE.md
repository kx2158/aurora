# Aurora developer guide

This is for anyone who forks Aurora and wants to add features, restyle it or swap the assistant. Aurora is a fork of VRCX (MIT), so everything in VRCX still works the same way. This guide covers what Aurora added on top.

## 1. Get it running

- Front end: Vue 3, Pinia, Tailwind 4, shadcn-vue, vue-i18n. `npm install`, then `npm run dev` for a browser preview (the C# side is missing there, so anything that calls `AppApi.*` does nothing).
- Windows app: C# with CefSharp (`Dotnet/VRCX-Cef.csproj`). Electron shell: `src-electron/` plus `Dotnet/VRCX-Electron.csproj`. Both share the `Dotnet/AppApi` folder.
- Real builds happen in GitHub Actions: `.github/workflows/aurora-windows.yml` (manual run, "Run workflow"). It builds the UI, the app and the NSIS installer `Aurora_Setup_x64.exe` and publishes a release. The in-app updater reads that release.
- The app only runs on Windows. A green build proves it compiles, not that it works, so test on a PC.

## 2. Where things live

| What | Where |
| --- | --- |
| All Aurora settings page | `src/views/Settings/components/Tabs/AuroraTab.vue` (one `SettingsGroup` per feature, each with an `id` like `nx-voice`) |
| The Aurora hub page (jump chips) | `src/views/Neon/Neon.vue` |
| Aurora services (logic, no UI) | `src/services/aurora*.js` |
| Aurora settings store | `src/stores/settings/aurora.js` |
| Home page stats | `src/views/Home/Home.vue`, `src/services/auroraStats.js` |
| Floating assistant | `src/components/AuroraCompanion.vue`, `AuroraMascot.vue`, `NeonDock.vue` |
| VR wrist panel and SteamVR dashboard | `src/vr/` (UI) and `Dotnet/Overlay/` (native) |
| Windows only C# features | `Dotnet/AppApi/Cef/*.cs` (stubs for Electron in `Dotnet/AppApi/Electron/`) |
| Themes | `src/styles/themes/*.css`, registry `src/shared/constants/themes.js` |
| Shared look layers | `src/styles/xray.css` (Aurora) and `src/styles/aurora-ui.css` (Neon) |
| Installer | `Installer/installer.nsi` |
| Texts and translations | `src/localization/en.json` (other locales fall back to English) |

Some names still say Neon or VRCX on purpose (config keys like `Neon_accent`, `VRCX_ThemeMode`, the data folder `%APPDATA%\Neon`, file names such as `Neon.sqlite3`, the `vrcx://` protocol). They keep old data working. Do not rename them unless you also write a migration.

## 3. Add a setting

1. Add the value and a setter to `src/stores/settings/aurora.js`. Read it in `load()` with `configRepository.getString/getBool/getInt('Aurora_yourKey', default)` and write it with `configRepository.setString(...)` in the setter.
2. Show it in `AuroraTab.vue` inside a `SettingsGroup`, using `SettingsItem` with a `Switch`, `Slider`, `Select` or `Input`. Destructure the value with `storeToRefs(store)` and the setter from `store`.
3. Add the label text to `src/localization/en.json` under `view.settings.aurora`.

If the feature has no store, a small service with its own `ref` and a `configRepository` key (see `src/services/auroraAccent.js`) is fine.

## 4. Add a feature with logic

Make a service in `src/services/auroraYourThing.js`, export reactive state and functions, and call its `init...()` from `src/App.vue` next to `initMusicMic()` and friends. Feed the assistant by calling `pushNews({ kind, title, text })` from `src/services/auroraNews.js`: it shows in the dock and the assistant says it.

React to VRChat events from the coordinators in `src/coordinators/` (for example `gameLogCoordinator.js` for joins and leaves, `friendPresenceCoordinator.js` for friends going online) and to notifications in `src/stores/notification/index.js`. `src/services/auroraPranks.js` and `auroraStatusRules.js` show the pattern.

## 5. Add a page

1. Create `src/views/YourPage/YourPage.vue`.
2. Add a route in `src/plugins/router.js`.
3. Add a nav entry in `src/shared/constants/ui.js` (`navDefinitions`) and place it in `src/components/nav-menu/navLayoutDefaults.js`.
4. Existing users keep their saved sidebar. To push a new layout to everyone once, change the migration flag in `src/components/nav-menu/composables/useNavLayout.js` (`Neon_navV2`).

## 6. Add a Windows (C#) feature

1. Add a public method to the partial class `AppApi` in a new file under `Dotnet/AppApi/Cef/`. JavaScript calls it as `AppApi.YourMethod(args)`. Return strings (use JSON for structured data) or simple types.
2. Add an empty stub with the same signature in `Dotnet/AppApi/Electron/`, otherwise the Electron build breaks.
3. Typings: `src/types/globals.d.ts` lists the AppApi methods.
4. Long running or audio work belongs on its own thread (see `NeonMusicMic.cs`: audio objects need a multi-threaded apartment).

## 7. Themes and colour

- Aurora (light), Aurora Dark: ids `xray` and `xraydark`. Colours are tokens in `src/styles/themes/xray.css` and `xray-dark.css`; the shared look (glass panels, corner brackets, fog, grain) is `src/styles/xray.css`.
- Neon, Neon Light: ids `aurora` and `auroralight`, the old pink cyberpunk look, in `aurora.css`, `aurora-light.css` and `aurora-ui.css`.
- Add a theme: write `src/styles/themes/yours.css` scoped to `:root[data-theme='yours']`, then register it in `THEME_CONFIG` in `src/shared/constants/themes.js` and add a `theme_mode_yours` label in `en.json`.
- The accent colour is one value (`src/services/auroraAccent.js`). It sets `--axh` (hue) for Aurora themes, `--aurora-pink` for Neon, and tints the assistant and the VR panels. Edit `ACCENT_PRESETS` to change the swatches.
- Theme specific code: `isNeonTheme()` in `src/services/auroraVoiceFx.js` tells you if the Neon look is active, and the `data-theme` attribute on `<html>` changes live (use a `MutationObserver`, see `AuroraCompanion.vue`).

## 8. Change the assistant

**Looks.** The default sprites are in `images/aurora/mascot/` (`neutral.png`, `joy.png`, `sad.png`, `sleepy.png`, `angry.png`, `surprised.png`, `smug.png`, `error.png`, plus mouth shapes `m-*.png`). Replace the files to restyle the built in character. `src/services/auroraCharacter.js` picks the face from the mood.

**Characters without code.** A character can be dropped in as an add-on (section 9): a folder with `faces/neutral.png` and any other face names. It then shows in the character picker.

**What it says.** `src/services/auroraLines.js` holds the line pools by category (greetings, idle, poke, alarms...). Add or edit lines there. The voice pre-renders them, so lines never contain names or numbers.

**How it speaks.** `src/services/auroraVoice.js` runs the Kokoro text to speech model in a worker (`src/workers/auroraTtsWorker.js`). Voice effects live in `src/services/auroraVoiceFx.js`: `applyVoiceFx` (bitcrusher, sample reducer, ring modulator, glitch), `addReverb`, and `effectiveFx` which decides the settings per theme (Neon is crunchy, Aurora is clean with a reverb slider). Add your own effect as another function in that file and add its key to the fx object.

**Moods.** `setMood` in `auroraVoice.js` and the `mood` argument of `say()` in `AuroraCompanion.vue`.

**Bubble, portrait and dock look.** Styles at the bottom of `AuroraCompanion.vue` (Neon) and the `.soft` block (Aurora), and `NeonDock.vue`. Aurora overrides for the dock are in `src/styles/xray.css`.

**Name.** The visible name is plain text in `AuroraCompanion.vue`, `AuroraMascot.vue`, `NeonDock.vue` and `auroraLines.js`.

## 9. Add-ons (for people who do not touch code)

A folder in the data folder, `%APPDATA%\Neon\addons\<name>\`:

```
addon.json            { "id": "name", "name": "Display name", "author": "you" }
faces\neutral.png     required for a character; add joy, sad, sleepy, angry, surprised, smug, error
voice\poke\*.mp3      recordings played instead of the generated voice
voice\idle\*.wav      kinds are the categories in auroraLines.js
```

Behaviour: add a `"behavior"` object to `addon.json` so the assistant acts like your character while it is shown:

```
"behavior": {
  "address": "darling",
  "persona": "You are Fox, sarcastic and warm. Short answers.",
  "lines": { "poke": ["Hm?", "What now."], "idle": ["..."] }
}
```

`lines` replace the built-in lines for each kind you list (kinds are the keys in `auroraLines.js`). `persona` is read with `getPersona()` from `auroraLines.js`, use it as the system prompt for any AI feature so it matches the character. It is plain text, not code.

Add-ons are only pictures, sound and text, they cannot run code. The loader is `src/services/auroraAddons.js` with the file access in `Dotnet/AppApi/Cef/NeonAddons.cs`.

## 10. Music to mic

Mixes one app's sound with your microphone into a virtual cable (VB-Cable or similar). Code: `src/services/auroraMusicMic.js` and `Dotnet/AppApi/Cef/NeonMusicMic.cs` (NAudio, WASAPI process loopback). Gain goes up to 500% for the mic and 1000% for music, each source has a bass boost (low shelf plus saturation), and a soft limiter on the mix stops hard clipping.

## 11. Data and safety

- The database is the VRCX SQLite file, now `Neon.sqlite3` in `%APPDATA%\Neon`. A daily copy is made to `Documents\Neon-backups\auto` (`src/services/auroraBackup.js`, keeps 30).
- `Dotnet/Program.cs` moves an old `%APPDATA%\VRCX` folder over and renames old file names on startup. If you change folder or file names, write the migration first and keep a backup step in the installer.
- The installer (`Installer/installer.nsi`) replaces an old VRCX or Neon install and never touches the data folder.
- Do not add auto-kick, bulk moderation or other automation of VRChat actions. It can get accounts banned.

## 12. Rules of thumb

- Keep `Neon_*`, `Aurora_*` and `VRCX_*` config keys stable.
- Every `AppApi` method needs an Electron stub.
- New texts go in `en.json` under `view.settings.aurora` (or the relevant group); missing keys fall back to English.
- Test on Windows. Check the log at `%APPDATA%\Neon\logs\Neon.log` when something crashes.

> AI assistants: see CLAUDE.md before helping with a fork.
