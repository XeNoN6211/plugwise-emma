'use strict';

// ESLint flat config. Replaces the old .eslintrc.json (eslint-config-athom),
// which only works with the unsupported ESLint 7.
module.exports = [
  {
    ignores: ['node_modules/**', '.homeybuild/**', 'env.json'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'after-used' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-use-before-define': ['error', { functions: false }],
      'no-shadow': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'require-await': 'warn',
      'no-useless-return': 'warn',
      'no-trailing-spaces': 'error',
      'eol-last': 'error',
      'max-len': ['warn', 120],
    },
  },
];
