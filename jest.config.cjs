/** @type {import('jest').Config} */
module.exports = {
  preset: undefined,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.(test|spec).ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  clearMocks: true,
  transform: {
    '^.+\\.(ts|tsx)$': ['babel-jest', { configFile: './babel.config.cjs' }],
  },
  testPathIgnorePatterns: ['<rootDir>/__tests__/fixtures/'],
};
