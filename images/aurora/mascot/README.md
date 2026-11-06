Neon's sprites (PNG, picked up automatically, named by file):

Emotions: `neutral`, `smug`, `joy`, `surprised`, `angry`, `sad`, `sleepy`, `error`.
Mouth shapes used while she talks: `m-closed`, `m-small`, `m-happy`, `m-o`, `m-grin`, `m-laugh` (also `m-tongue`, `m-smirk`, `m-flat`).

The mouth follows the loudness of the voice and the face follows the emotion guessed from the words.
Without `neutral.png` the app icon is used.

More characters: make a sub folder (for example `fox/`) and put the same file names inside it.
Only `neutral.png` is required, any face a character does not have falls back to its neutral.
The character picker in Settings lists every folder that has a `neutral.png`.

The default character is `aurora/` (a translucent glass android). It has a neutral face and the nine mouth shapes
used while talking (closed, small, happy, laugh, o, flat, smirk, tongue, grin), so it only moves its mouth.
The emotion faces (joy, sad, angry...) are not drawn yet, so those fall back to its neutral face.
Add `joy.png`, `sad.png` and so on to `aurora/` to give it expressions.
