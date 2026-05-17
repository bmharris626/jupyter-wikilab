const jestJupyterLab = require('@jupyterlab/testutils/lib/jest-config');

const baseConfig = jestJupyterLab(__dirname);

// Extend the base pattern to also transform @jupyterlab/* packages from source
const basePattern = baseConfig.transformIgnorePatterns[0];
const transformIgnorePatterns = [
  basePattern.replace('/node_modules/(?!', '/node_modules/(?!@jupyterlab/|')
];

module.exports = {
  ...baseConfig,
  automock: false,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/.ipynb_checkpoints/*'
  ],
  coverageReporters: ['lcov', 'text'],
  testRegex: 'src/.*/.*.spec.ts[x]?$',
  transformIgnorePatterns
};
