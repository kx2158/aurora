<div align="center">

# <img src="./images/aurora/icon.png" width="64" height="64" alt=""> Aurora

A personal, privacy-first VRChat companion with a baby pink look, a robot mascot voice and built-in data cleanup.

</div>

Aurora is a personal fork of [VRCX](https://github.com/vrcx-team/VRCX) (MIT licensed). It is the full VRCX app, so friends, worlds, avatars, the feed, the game log and the rest all work the way you know, plus the changes below. It is not made by or affiliated with VRChat Inc. or the VRCX team.

## What is different

- **Aurora look:** a dark, pink-accented theme that is the default (`Settings > Interface > Theme`).
- **Mascot voice:** short spoken lines from a local text-to-speech model (Kokoro-82M, runs on the CPU, nothing leaves your PC), with robot effects: bitcrusher, sample crush, ring modulation and stutter.
- **Data cleanup:** removes invite data, expired notifications, download logs, caches and old feed entries. Preview first, confirm, optional automatic run after login.
- **App lock:** optional PIN with idle auto-lock and growing delays after wrong tries. It keeps people out of the app. It does not encrypt files on disk, so use BitLocker for that.
- **No calls home:** the updater and the crash reporter are switched off.
- **Hardening:** sandboxed windows in the Electron build, no extra windows, no navigating away, no camera, microphone or location requests.
- **Safe by design:** Aurora reads your VRChat logs and uses VRChat's normal API the way VRCX does. It has no auto-kick, bulk moderation or other automation, because that can get an account banned.

All Aurora settings live in `Settings > Aurora`.

## Get the app

Aurora is built on GitHub, so you do not need any developer tools.

1. Open this repository on GitHub, go to the **Actions** tab.
2. Choose **Build Aurora (Windows installer)** and press **Run workflow**.
3. When it finishes (about 10 to 15 minutes), open the run and download **Aurora-Setup** from *Artifacts*. Unzip it and run `Aurora_Setup_x64.exe`.

Things to know:

- Windows may show a SmartScreen warning because the installer is not code-signed. Only install builds you made yourself from this repository.
- Aurora installs over VRCX and uses the same data folder (`%APPDATA%\VRCX`), so your history, favorites and settings carry over. Do not run stock VRCX and Aurora at the same time. Back up that folder before the first run.
- This build has not been tested on a real machine yet. If the workflow fails, open the failed step and send me the red error text.

## Build it yourself

Needs Node 24 or newer and the .NET 10 SDK.

```
npm install
npm run dev        # UI preview in the browser
npm run prod       # production UI build
```

The Windows app is built from `Dotnet/VRCX-Cef.csproj`, and the installer from `Installer/installer.nsi`. See `.github/workflows/aurora-windows.yml` for the exact steps.

## Customizing

`MY_VERSION.md` explains what was changed, where things live (themes, settings, database, log parsing), how to rename the app, and how to pull in upstream VRCX fixes later.

## Credits and license

Aurora is built on VRCX by the VRCX team and contributors, released under the MIT license. The license and copyright notice are kept in `LICENSE`. VRChat is a trademark of VRChat Inc.
