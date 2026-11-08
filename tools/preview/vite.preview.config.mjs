// Builds the app plus the preview page, so the preview runs on a normal production build
// (no dev-server dependency reloads in the middle of screenshots).
import { resolve } from 'node:path';

import baseConfig from '../../src/vite.config.js';

export default async (env) => {
    const config = typeof baseConfig === 'function' ? await baseConfig(env) : baseConfig;
    config.root = resolve(import.meta.dirname, '../../src');
    config.build.outDir = resolve(import.meta.dirname, '../../build/preview');
    config.build.rolldownOptions.input = {
        ...config.build.rolldownOptions.input,
        preview: resolve(import.meta.dirname, '../../src/preview.html')
    };
    return config;
};
