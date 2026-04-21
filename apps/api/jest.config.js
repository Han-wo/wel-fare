module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@welfare-ai/shared-utils$': '<rootDir>/../../packages/shared-utils/src',
    '^@welfare-ai/shared-types$': '<rootDir>/../../packages/shared-types/src',
  },
};
