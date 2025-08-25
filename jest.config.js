export default {
  projects: [
    // Unit tests configuration
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/packages/*/src/**/__tests__/**/*.test.ts',
        '<rootDir>/packages/*/src/**/__tests__/**/*.test.tsx',
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/unit/**/*.test.tsx'
      ],
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      globals: {
        'ts-jest': {
          useESM: true,
          tsconfig: {
            module: 'esnext'
          }
        }
      },
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/unit-setup.ts'],
      collectCoverageFrom: [
        'packages/*/src/**/*.{ts,tsx}',
        '!packages/*/src/**/*.d.ts',
        '!packages/*/src/**/__tests__/**',
        '!packages/*/src/**/index.ts'
      ],
      coverageDirectory: '<rootDir>/coverage/unit',
      coverageReporters: ['text', 'lcov', 'html'],
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      },
      moduleNameMapping: {
        '^@aicompare/(.*)$': '<rootDir>/packages/$1/src',
        '^@/(.*)$': '<rootDir>/packages/web-dashboard/src/$1'
      }
    },
    
    // Integration tests configuration
    {
      displayName: 'integration',
      testMatch: [
        '<rootDir>/tests/integration/**/*.test.ts',
        '<rootDir>/tests/integration/**/*.test.tsx'
      ],
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      globals: {
        'ts-jest': {
          useESM: true,
          tsconfig: {
            module: 'esnext'
          }
        }
      },
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/integration-setup.ts'],
      testTimeout: 30000, // 30 seconds for integration tests
      collectCoverageFrom: [
        'packages/*/src/**/*.{ts,tsx}',
        '!packages/*/src/**/*.d.ts',
        '!packages/*/src/**/__tests__/**'
      ],
      coverageDirectory: '<rootDir>/coverage/integration',
      moduleNameMapping: {
        '^@aicompare/(.*)$': '<rootDir>/packages/$1/src',
        '^@/(.*)$': '<rootDir>/packages/web-dashboard/src/$1'
      }
    },

    // Frontend component tests configuration
    {
      displayName: 'frontend-components',
      testMatch: [
        '<rootDir>/packages/web-dashboard/src/**/__tests__/**/*.test.tsx',
        '<rootDir>/tests/frontend/**/*.test.tsx'
      ],
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/frontend-setup.ts'],
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      globals: {
        'ts-jest': {
          useESM: true,
          tsconfig: {
            jsx: 'react-jsx',
            module: 'esnext'
          }
        }
      },
      moduleNameMapping: {
        '^@/(.*)$': '<rootDir>/packages/web-dashboard/src/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      },
      collectCoverageFrom: [
        'packages/web-dashboard/src/**/*.{ts,tsx}',
        '!packages/web-dashboard/src/**/*.d.ts',
        '!packages/web-dashboard/src/**/__tests__/**',
        '!packages/web-dashboard/src/pages/_*.tsx'
      ],
      coverageDirectory: '<rootDir>/coverage/frontend'
    }
  ],
  
  // Global settings
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov', 'html'],
  
  // Test result processors
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '<rootDir>/test-results',
      outputName: 'junit.xml'
    }]
  ]
};