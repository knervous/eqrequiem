export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
            useDefineForClassFields: false,
          },
          target: 'es2022',
        },
        module: {
          type: 'es6',
        },
      },
    ],
  },
  testMatch: [
    '**/tests/**/*.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/jest-setup.ts'],
};
