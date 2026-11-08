// Aurora's desktop overlay page: a small panel shown over VRChat with a hotkey.
// It only draws what the main app sends (window.deskState) and sends clicks back (DeskApi.Command).
import { createApp } from 'vue';

import '../styles/themes/xray-dark.css';
import '../styles/themes/xray.css';
import '../styles/globals.css';
import { i18n, loadLocalizedStrings } from '../plugins/i18n';

import Desk from './Desk.vue';

await loadLocalizedStrings('en');

const app = createApp(Desk);
app.use(i18n);
app.mount('#root');
