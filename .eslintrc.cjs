module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  globals: {
    BarcodeDetector: 'readonly', // experimental browser API, not in standard typedefs
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'dev-dist'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    // Fast-refresh: many files intentionally co-export utilities with components
    'react-refresh/only-export-components': 'off',
    // Hooks deps — off because many existing effects intentionally omit deps
    'react-hooks/exhaustive-deps': 'off',
    // Allow console for error/warn logging in prod
    'no-console': 'off',
    // Empty catch blocks are a deliberate pattern in this codebase
    'no-empty': 'off',
    // Allow unused vars/args prefixed with _ (intentional exclusion pattern)
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    // No PropTypes — this codebase uses JS without runtime type checking
    'react/prop-types': 'off',
    // Apostrophes in English prose don't need escaping — React handles them fine
    'react/no-unescaped-entities': 'off',
  },
}
