# Aurora preview

Runs the real app UI in a normal browser with fake data, so pages can be screenshotted without Windows,
VRChat or a login. CI copies `preview.html` and `preview.js` into `src/`, starts Vite and runs `shoot.mjs`.

Nothing here ships in the app.
