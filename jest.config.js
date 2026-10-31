module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  clearMocks: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@notifee|date-fns)/)',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/backend/',
    '<rootDir>/android/',
    '<rootDir>/ota-release/',
    '<rootDir>/.bundle/',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/backend/',
  ],
};
