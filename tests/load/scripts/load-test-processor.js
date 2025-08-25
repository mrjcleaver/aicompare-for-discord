/**
 * Load Test Processor Functions
 * Custom JavaScript functions for Artillery load testing
 */

const { faker } = require('@faker-js/faker');

module.exports = {
  // Custom functions available in test scenarios
  
  /**
   * Generate realistic test data for comparisons
   */
  generateTestPrompt: function(context, events, done) {
    const topics = [
      'artificial intelligence', 'machine learning', 'blockchain', 'quantum computing',
      'climate change', 'renewable energy', 'space exploration', 'biotechnology',
      'cybersecurity', 'data science', 'cloud computing', 'internet of things'
    ];
    
    const questionTypes = [
      'What is', 'How does', 'Why is', 'What are the benefits of',
      'Explain', 'Describe', 'Compare', 'What is the future of'
    ];
    
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const questionType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
    
    context.vars.generatedPrompt = `${questionType} ${topic}?`;
    return done();
  },

  /**
   * Setup user session with test data
   */
  setupUserSession: function(context, events, done) {
    context.vars.userId = `load-test-user-${faker.datatype.uuid()}`;
    context.vars.username = faker.internet.userName();
    context.vars.sessionId = faker.datatype.uuid();
    return done();
  },

  /**
   * Generate realistic model combinations
   */
  selectModelCombination: function(context, events, done) {
    const combinations = [
      ['gpt-4'],
      ['claude-3.5-sonnet'],
      ['gpt-4', 'claude-3.5-sonnet'],
      ['gpt-4', 'claude-3.5-sonnet', 'gemini-1.5-pro'],
      ['claude-3.5-sonnet', 'gemini-1.5-pro'],
      ['gpt-4', 'gemini-1.5-pro', 'command-r-plus']
    ];
    
    context.vars.selectedModels = combinations[Math.floor(Math.random() * combinations.length)];
    return done();
  },

  /**
   * Simulate realistic think time between user actions
   */
  simulateThinkTime: function(context, events, done) {
    // Random think time between 1-5 seconds
    const thinkTime = Math.random() * 4000 + 1000;
    
    setTimeout(() => {
      done();
    }, thinkTime);
  },

  /**
   * Validate response structure
   */
  validateComparisonResponse: function(context, events, done) {
    const response = context.vars.lastResponse;
    
    if (!response || !response.comparison) {
      events.emit('error', 'Invalid comparison response structure');
      return done();
    }
    
    if (!response.comparison.id) {
      events.emit('error', 'Missing comparison ID in response');
      return done();
    }
    
    context.vars.validatedComparisonId = response.comparison.id;
    return done();
  },

  /**
   * Generate realistic vote data
   */
  generateVoteData: function(context, events, done) {
    const voteTypes = ['thumbs_up', 'thumbs_down', 'star_rating'];
    const voteType = voteTypes[Math.floor(Math.random() * voteTypes.length)];
    
    let value;
    if (voteType === 'star_rating') {
      // Weight ratings towards higher values (more realistic)
      const weights = [1, 2, 3, 4, 4, 5, 5, 5]; // 3x weight for 4-5 stars
      value = weights[Math.floor(Math.random() * weights.length)];
    } else {
      value = 1;
    }
    
    context.vars.voteType = voteType;
    context.vars.voteValue = value;
    return done();
  },

  /**
   * Log custom metrics
   */
  logCustomMetrics: function(context, events, done) {
    const startTime = context.vars.requestStartTime || Date.now();
    const responseTime = Date.now() - startTime;
    
    // Emit custom metrics
    events.emit('customStat', {
      stat: 'user_flow_duration',
      value: responseTime
    });
    
    if (context.vars.comparisonCreated) {
      events.emit('customStat', {
        stat: 'comparison_creation_rate',
        value: 1
      });
    }
    
    return done();
  },

  /**
   * Error handling and recovery
   */
  handleError: function(context, events, done) {
    // Log error details for analysis
    if (context.vars.lastError) {
      console.log(`Load test error: ${context.vars.lastError.message}`);
      
      events.emit('customStat', {
        stat: 'error_rate',
        value: 1
      });
    }
    
    return done();
  },

  /**
   * Performance assertion helper
   */
  assertPerformance: function(context, events, done) {
    const responseTime = context._reqStartedAt ? Date.now() - context._reqStartedAt : 0;
    
    if (responseTime > 3000) {
      events.emit('error', `Slow response detected: ${responseTime}ms`);
    }
    
    // Track response time percentiles
    events.emit('customStat', {
      stat: 'response_time_ms',
      value: responseTime
    });
    
    return done();
  },

  /**
   * Cleanup function
   */
  cleanup: function(context, events, done) {
    // Clean up any test data or connections
    if (context.vars.testDataId) {
      // Could make cleanup API call here if needed
      console.log(`Cleaning up test data: ${context.vars.testDataId}`);
    }
    
    return done();
  }
};

/**
 * Hook functions that run at different test lifecycle points
 */

// Before the test scenario starts
module.exports.beforeScenario = function(context, events, done) {
  context.vars.scenarioStartTime = Date.now();
  context.vars.requestCount = 0;
  return done();
};

// After the test scenario completes
module.exports.afterScenario = function(context, events, done) {
  const scenarioDuration = Date.now() - context.vars.scenarioStartTime;
  
  events.emit('customStat', {
    stat: 'scenario_duration_ms',
    value: scenarioDuration
  });
  
  events.emit('customStat', {
    stat: 'requests_per_scenario',
    value: context.vars.requestCount || 0
  });
  
  return done();
};

// Before each request
module.exports.beforeRequest = function(requestSpec, context, ee, done) {
  context.vars.requestStartTime = Date.now();
  context.vars.requestCount = (context.vars.requestCount || 0) + 1;
  
  // Add correlation ID for request tracing
  if (!requestSpec.headers) {
    requestSpec.headers = {};
  }
  requestSpec.headers['X-Correlation-ID'] = `load-test-${faker.datatype.uuid()}`;
  
  return done();
};

// After each request
module.exports.afterRequest = function(requestSpec, response, context, ee, done) {
  const responseTime = Date.now() - context.vars.requestStartTime;
  
  // Track response times by endpoint
  const endpoint = requestSpec.url || 'unknown';
  ee.emit('customStat', {
    stat: `response_time_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
    value: responseTime
  });
  
  // Track status codes
  ee.emit('customStat', {
    stat: `status_${response.statusCode}`,
    value: 1
  });
  
  return done();
};