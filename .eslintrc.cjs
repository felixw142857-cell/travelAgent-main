module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'backend/**', '.eslintrc.cjs'],
  overrides: [
    { files: ['*.config.ts', '*.config.js'], env: { node: true } },
    {
      files: ['src/components/ui/button.tsx', 'src/components/ui/badge.tsx'],
      rules: {
        'react-refresh/only-export-components': ['warn', {
          allowConstantExport: true,
          allowExportNames: ['buttonVariants', 'badgeVariants'],
        }],
      },
    },
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': ['warn'],
    '@typescript-eslint/no-explicit-any': ['warn'],
  },
} 
