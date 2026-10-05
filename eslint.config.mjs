import twill from '@swiftuijs/twill-linter';

export default [
  {
    ignores: [
      'examples/react-framework/upstream/**',
      'examples/react-framework/src/packages/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  ...twill.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        document: 'readonly',
        window: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
      },
    },
  },
];
