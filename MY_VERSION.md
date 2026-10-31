# My version of VRCX

This is a personal fork of VRCX (MIT licensed). It is the full VRCX code, with a few changes that make it yours. Everything else works exactly like VRCX, including your existing data.

## What is already changed

- **No calls home.** The updater and the crash reporter are switched off in `src/shared/constants/fork.js`. Without this, the app would check the original project's servers and offer to replace your fork with stock VRCX. Flip `updaterEnabled` or `telemetryEnabled` to `true` there if you ever want them back.
- **Your name.** Run `node build-scripts/set-app-name.js "Your Name"` to change the name shown in window titles and the installer. It is set to `Aurora`. Run it again any time with another name.
- **Your data stays compatible.** The data folder is still `%APPDATA%\VRCX`, so a fork that you run on the same PC picks up your existing VRCX history, favorites and settings. Do not run it and stock VRCX at the same time, they would fight over the same database. To keep the fork's data completely separate, start it with `--config="C:\MyVRCXData\"`.

## Things you asked for that VRCX already does

Open Settings, System tab: **Start at Windows startup**, **Start as minimized**, **Close to tray**. With those on, it runs in the background and keeps tracking whenever VRChat is running.

## Where things live

| You want to change | Look here |
| --- | --- |
| What gets read from VRChat's logs (joins, world changes, and so on) | `Dotnet/LogWatcher.cs` |
| Anything on screen | `src/views/` (one folder per page) and `src/components/` |
| A setting (add a toggle, a number, an option) | `src/stores/settings/*.js` for the value, then the matching tab in `src/views/Settings/components/Tabs/` for the control |
| Colors and look | `src/styles/globals.css` and `src/styles/themes/` |
| App state and data handling for a feature | `src/stores/` (one file per feature) |
| Window, tray and startup behavior | `src-electron/main.js` (Electron build) and `Dotnet/` (native side) |
| The database | `Dotnet/SQLite.cs` and the `src/services/` folder |
| Texts and translations | `src/localization/en.json` |

The front end is Vue 3 with Tailwind and shadcn-vue, so most customization is plain Vue files and CSS variables.

## Building

See the project's own guide: https://github.com/vrcx-team/VRCX/wiki/Building-from-source

Quick front end preview, after `npm ci`: `npm run dev`.

## Staying in sync with the original

Your changes are in their own commits on the `my-vrcx` branch. To pull in upstream fixes later, add the original as a remote and merge or rebase:

```
git remote add upstream https://github.com/vrcx-team/VRCX.git
git fetch upstream
git merge upstream/master
```

## Licence

VRCX is MIT licensed. Keep the `LICENSE` file and its copyright line in your fork, and you are free to change, rename and share it.

## Not tested

These edits were made without being able to build the app here (the project's dependencies could not be installed), so the first thing to do on your machine is `npm ci` and a build. The changes are small and limited to the files listed above. If the project's tests (`npm test`) complain about the updater, they predate the fork switch and just need `updaterEnabled` set to `true` inside the test.

## Icon

The app icon is `images/aurora/icon.png`. The files `images/VRCX.png`, `VRCX.ico`, `VRCX_notify.png` and `VRCX_notify.ico` are exports of it (same names on purpose, so the build keeps working). To change it, replace that PNG and re-export.
