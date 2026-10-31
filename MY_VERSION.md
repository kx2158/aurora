# My version of VRCX

This is a personal fork of VRCX (MIT licensed). It is the full VRCX code, with a few changes that make it yours. Everything else works exactly like VRCX, including your existing data.

## What is already changed

- **No calls home.** The updater and the crash reporter are switched off in `src/shared/constants/fork.js`. Without this, the app would check the original project's servers and offer to replace your fork with stock VRCX. Flip `updaterEnabled` or `telemetryEnabled` to `true` there if you ever want them back.
- **Your name.** Run `node build-scripts/set-app-name.js "Your Name"` to change the name shown in window titles and the installer. It is set to `Neon`. Run it again any time with another name.
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

## Security (app lock)

Settings > Neon > Security sets a PIN (4 to 12 digits). Neon then starts locked and re-locks after the idle time you choose. Only a salted PBKDF2 hash is stored. Repeated wrong PINs add growing waits. This keeps people out of the app. It does not encrypt the database or config files on disk, so use Windows disk encryption (BitLocker) for that. The updater and crash reporter stay off, so the app makes no calls to the original project.

## Hardening (what was done, what was not)

- **No calls home:** updater and crash reporter are off (`src/shared/constants/fork.js`).
- **Electron build:** context isolation, sandbox and web security are set explicitly. The app cannot open extra windows or navigate away from its own pages, only plain http(s) links open in your normal browser, and camera, microphone and location requests are refused. Mostly relevant on Linux and macOS.
- **Page policy:** `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` in `src/index.html`. A stricter script policy was left out on purpose because it can break the Vite build and VRCX's many image hosts.
- **App lock:** see Security above.
- **Not done / you should do:** the Windows build uses the CEF shell (C# in `Dotnet/`), which I could not compile or audit here. Run `npm audit` after `npm ci` and update flagged packages. Turn on BitLocker for the data folder. Only install builds you made yourself from this repo.
- **VRChat rules:** Neon only reads your logs and VRChat's normal API the way VRCX does. It has no bulk moderation, auto-kick or automation features, because automating actions against VRChat can get an account banned.

## Mascot

The mascot is named Neon. Voice lines are spoken by her (Settings > Neon). The mascot sprites (expression and mouth sheets) are not in the repo yet.
