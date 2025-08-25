/**
 * Stress Test Processor Functions
 * Custom functions for high-load stress testing scenarios
 */

const crypto = require('crypto');

module.exports = {
  /**
   * Generate high-volume test data
   */
  generateBulkTestData: function(context, events, done) {
    const bulkSize = Math.floor(Math.random() * 20) + 10; // 10-30 items
    const testData = [];
    
    for (let i = 0; i < bulkSize; i++) {
      testData.push({
        id: crypto.randomUUID(),
        prompt: `Bulk test prompt ${i} - ${crypto.randomBytes(16).toString('hex')}`,
        timestamp: Date.now() + i
      });
    }
    
    context.vars.bulkTestData = testData;
    context.vars.bulkSize = bulkSize;
    return done();
  },

  /**
   * Simulate memory-intensive operations
   */
  simulateMemoryLoad: function(context, events, done) {
    // Create large objects to simulate memory pressure
    const largeData = [];
    const arraySize = Math.floor(Math.random() * 1000) + 500; // 500-1500 elements
    
    for (let i = 0; i < arraySize; i++) {
      largeData.push({
        id: i,
        data: crypto.randomBytes(1024).toString('base64'), // 1KB per item
        timestamp: Date.now(),
        random: Math.random()
      });
    }
    
    context.vars.memoryTestData = largeData;
    
    // Clean up after a short delay to prevent memory leaks
    setTimeout(() => {
      delete context.vars.memoryTestData;
    }, 5000);
    
    return done();
  },

  /**
   * Generate concurrent request burst
   */
  prepareBurstRequest: function(context, events, done) {
    const burstId = crypto.randomUUID();
    const burstSize = Math.floor(Math.random() * 50) + 10; // 10-60 concurrent requests
    
    context.vars.burstId = burstId;
    context.vars.burstSize = burstSize;
    context.vars.burstStartTime = Date.now();
    
    events.emit('customStat', {
      stat: 'burst_initiated',
      value: burstSize
    });
    
    return done();
  },

  /**
   * Simulate CPU-intensive operations
   */
  simulateCPULoad: function(context, events, done) {
    const startTime = Date.now();
    const duration = Math.floor(Math.random() * 100) + 50; // 50-150ms of CPU work
    
    // CPU-intensive calculation
    let result = 0;
    while (Date.now() - startTime < duration) {
      result += Math.sqrt(Math.random() * 1000000);
    }
    
    context.vars.cpuResult = result;
    
    events.emit('customStat', {
      stat: 'cpu_load_duration_ms',
      value: Date.now() - startTime
    });
    
    return done();
  },

  /**
   * Generate random error simulation
   */
  simulateRandomErrors: function(context, events, done) {
    const errorRate = 0.1; // 10% chance of simulated error
    
    if (Math.random() < errorRate) {
      const errorTypes = [
        'SIMULATED_TIMEOUT',
        'SIMULATED_CONNECTION_ERROR',
        'SIMULATED_RATE_LIMIT',
        'SIMULATED_SERVER_ERROR'
      ];
      
      const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
      
      events.emit('customStat', {
        stat: 'simulated_error',
        value: 1,
        type: errorType
      });
      
      // Don't actually fail the test, just record the metric
    }
    
    return done();
  },

  /**
   * Monitor resource usage during stress test
   */
  monitorResources: function(context, events, done) {
    const memUsage = process.memoryUsage();
    
    events.emit('customStat', {
      stat: 'memory_heap_used_mb',
      value: Math.round(memUsage.heapUsed / 1024 / 1024)
    });
    
    events.emit('customStat', {
      stat: 'memory_heap_total_mb', 
      value: Math.round(memUsage.heapTotal / 1024 / 1024)
    });
    
    events.emit('customStat', {
      stat: 'memory_external_mb',
      value: Math.round(memUsage.external / 1024 / 1024)
    });
    
    return done();
  },

  /**
   * Generate realistic stress patterns
   */
  generateStressPattern: function(context, events, done) {
    const patterns = [
      'spike',      // Sudden increase in load
      'wave',       // Gradual increase and decrease
      'constant',   // Sustained high load
      'random'      // Random fluctuations
    ];
    
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const intensity = Math.random() * 0.5 + 0.5; // 0.5-1.0 intensity
    
    context.vars.stressPattern = pattern;
    context.vars.stressIntensity = intensity;
    
    // Adjust request timing based on pattern
    switch (pattern) {
      case 'spike':
        context.vars.requestDelay = Math.random() * 100; // 0-100ms delay
        break;
      case 'wave':
        context.vars.requestDelay = Math.sin(Date.now() / 10000) * 500 + 500; // 0-1000ms sinusoidal
        break;
      case 'constant':
        context.vars.requestDelay = 50; // Fixed 50ms delay
        break;
      case 'random':
        context.vars.requestDelay = Math.random() * 2000; // 0-2000ms random delay
        break;
    }
    
    return done();
  },

  /**
   * Cleanup stress test artifacts
   */
  cleanupStressArtifacts: function(context, events, done) {
    // Clean up any large data structures created during stress testing
    const keysToClean = [
      'bulkTestData',
      'memoryTestData',
      'cpuResult',
      'largePayload'
    ];
    
    keysToClean.forEach(key => {
      if (context.vars[key]) {
        delete context.vars[key];
      }
    });
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    return done();
  }
};

// Stress test lifecycle hooks

module.exports.beforeScenario = function(context, events, done) {
  context.vars.stressTestStartTime = Date.now();
  context.vars.totalRequestsMade = 0;
  context.vars.errorCount = 0;
  
  // Initialize stress tracking
  events.emit('customStat', {
    stat: 'stress_scenario_started',
    value: 1
  });
  
  return done();
};

module.exports.afterScenario = function(context, events, done) {
  const stressDuration = Date.now() - context.vars.stressTestStartTime;
  
  events.emit('customStat', {
    stat: 'stress_scenario_duration_ms',
    value: stressDuration
  });
  
  events.emit('customStat', {
    stat: 'stress_total_requests',
    value: context.vars.totalRequestsMade || 0
  });
  
  events.emit('customStat', {
    stat: 'stress_error_count',
    value: context.vars.errorCount || 0
  });
  
  // Calculate stress score based on performance
  const requestsPerSecond = (context.vars.totalRequestsMade || 0) / (stressDuration / 1000);
  const errorRate = (context.vars.errorCount || 0) / (context.vars.totalRequestsMade || 1);
  const stressScore = requestsPerSecond * (1 - errorRate);
  
  events.emit('customStat', {
    stat: 'stress_performance_score',
    value: Math.round(stressScore * 100) / 100
  });
  
  return done();
};

module.exports.beforeRequest = function(requestSpec, context, ee, done) {
  context.vars.stressRequestStartTime = Date.now();
  context.vars.totalRequestsMade = (context.vars.totalRequestsMade || 0) + 1;
  
  // Add stress test headers
  if (!requestSpec.headers) {
    requestSpec.headers = {};
  }
  
  requestSpec.headers['X-Stress-Test'] = 'true';
  requestSpec.headers['X-Stress-Pattern'] = context.vars.stressPattern || 'unknown';
  requestSpec.headers['X-Stress-Intensity'] = context.vars.stressIntensity || 0;
  requestSpec.headers['X-Request-Sequence'] = context.vars.totalRequestsMade;
  
  return done();
};

module.exports.afterRequest = function(requestSpec, response, context, ee, done) {
  const responseTime = Date.now() - context.vars.stressRequestStartTime;
  
  // Track stress-specific metrics
  ee.emit('customStat', {
    stat: 'stress_response_time_ms',
    value: responseTime
  });
  
  // Track errors
  if (response.statusCode >= 400) {
    context.vars.errorCount = (context.vars.errorCount || 0) + 1;
    
    ee.emit('customStat', {
      stat: 'stress_http_error',
      value: 1,
      statusCode: response.statusCode
    });
  }
  
  // Track extremely slow responses
  if (responseTime > 5000) {
    ee.emit('customStat', {
      stat: 'stress_slow_response',
      value: 1
    });
  }
  
  // Track resource pressure indicators
  if (response.headers && response.headers['x-response-time']) {
    const serverResponseTime = parseInt(response.headers['x-response-time']);
    if (serverResponseTime > 1000) {
      ee.emit('customStat', {
        stat: 'stress_server_pressure',
        value: serverResponseTime
      });
    }
  }
  
  return done();
};