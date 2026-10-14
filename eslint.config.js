import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', '.wrangler/', 'migrations/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['vite.config.js', 'eslint.config.js', 'drizzle.config.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
