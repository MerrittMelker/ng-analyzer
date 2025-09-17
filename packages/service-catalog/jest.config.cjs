const path = require('path');
/** @type {import('jest').Config} */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testRegex: ['__tests__/.*\\.test\\.ts$'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  clearMocks: true,
  verbose: true,
  transform: {
    '^.+\\.tsx?$': ['babel-jest', { configFile: path.resolve(__dirname, '../../babel.config.cjs') }],
  },
};
