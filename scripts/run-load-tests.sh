#!/bin/bash

# Load Testing Script for AI Compare
# Runs comprehensive load tests with different scenarios

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOAD_TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/tests/load"
RESULTS_DIR="$LOAD_TEST_DIR/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Default values
TARGET_URL=${LOAD_TEST_TARGET:-"http://localhost:3001"}
TEST_TYPE=${1:-"basic"}
ENVIRONMENT=${NODE_ENV:-"test"}

# Ensure results directory exists
mkdir -p "$RESULTS_DIR"

echo -e "${BLUE}🚀 Starting AI Compare Load Tests${NC}"
echo -e "${BLUE}Target: $TARGET_URL${NC}"
echo -e "${BLUE}Test Type: $TEST_TYPE${NC}"
echo -e "${BLUE}Environment: $ENVIRONMENT${NC}"
echo -e "${BLUE}Results will be saved to: $RESULTS_DIR${NC}"
echo ""

# Function to run a specific test
run_test() {
    local test_name="$1"
    local test_file="$2"
    local description="$3"
    
    echo -e "${YELLOW}📊 Running $test_name${NC}"
    echo -e "${YELLOW}Description: $description${NC}"
    
    local output_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}"
    
    # Run Artillery test
    npx artillery run "$LOAD_TEST_DIR/$test_file" \
        --target "$TARGET_URL" \
        --output "$output_file.json" \
        2>&1 | tee "$output_file.log"
    
    # Generate HTML report
    if [ -f "$output_file.json" ]; then
        npx artillery report "$output_file.json" \
            --output "$output_file.html"
        echo -e "${GREEN}✅ $test_name completed successfully${NC}"
        echo -e "${GREEN}   Report: $output_file.html${NC}"
    else
        echo -e "${RED}❌ $test_name failed - no results generated${NC}"
        return 1
    fi
    
    echo ""
}

# Function to check if services are running
check_services() {
    echo -e "${BLUE}🔍 Checking if services are running...${NC}"
    
    # Check API server
    if curl -f -s "$TARGET_URL/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API server is running${NC}"
    else
        echo -e "${RED}❌ API server is not responding at $TARGET_URL${NC}"
        echo -e "${YELLOW}Please start the API server before running load tests${NC}"
        exit 1
    fi
    
    # Check web dashboard (if different from API)
    local web_url="${LOAD_TEST_WEB_TARGET:-http://localhost:3000}"
    if [ "$web_url" != "$TARGET_URL" ]; then
        if curl -f -s "$web_url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Web dashboard is running${NC}"
        else
            echo -e "${YELLOW}⚠️  Web dashboard not responding at $web_url${NC}"
        fi
    fi
    
    echo ""
}

# Function to setup test data
setup_test_data() {
    echo -e "${BLUE}🛠️  Setting up test data...${NC}"
    
    # Create test users and basic data if needed
    if [ -f "scripts/setup-test-data.js" ]; then
        node scripts/setup-test-data.js
        echo -e "${GREEN}✅ Test data setup completed${NC}"
    else
        echo -e "${YELLOW}⚠️  No test data setup script found${NC}"
    fi
    
    echo ""
}

# Function to run all tests
run_all_tests() {
    echo -e "${BLUE}📋 Running all load test scenarios...${NC}"
    echo ""
    
    # Basic load test
    run_test "basic-load-test" "basic-load-test.yml" \
        "Standard application load with normal usage patterns"
    
    # Stress test
    if [ "$ENVIRONMENT" != "production" ]; then
        run_test "stress-test" "stress-test.yml" \
            "High-load stress test to find breaking points"
    else
        echo -e "${YELLOW}⚠️  Skipping stress test in production environment${NC}"
    fi
    
    # Discord bot simulation
    if [ -n "$DISCORD_BOT_TARGET" ] || curl -f -s "http://localhost:3002/health" > /dev/null 2>&1; then
        run_test "discord-bot-simulation" "scenarios/discord-bot-simulation.yml" \
            "Discord bot command and interaction simulation"
    else
        echo -e "${YELLOW}⚠️  Discord bot not available - skipping bot simulation${NC}"
    fi
}

# Function to generate summary report
generate_summary() {
    echo -e "${BLUE}📈 Generating test summary...${NC}"
    
    local summary_file="$RESULTS_DIR/summary_${TIMESTAMP}.html"
    
    cat > "$summary_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>AI Compare Load Test Summary - $TIMESTAMP</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .test-result { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { border-color: #28a745; }
        .warning { border-color: #ffc107; }
        .error { border-color: #dc3545; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .metric { background: #f8f9fa; padding: 10px; border-radius: 3px; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 AI Compare Load Test Summary</h1>
        <p><strong>Timestamp:</strong> $TIMESTAMP</p>
        <p><strong>Target:</strong> $TARGET_URL</p>
        <p><strong>Environment:</strong> $ENVIRONMENT</p>
    </div>
EOF
    
    # Add results for each test
    for result_file in "$RESULTS_DIR"/*_${TIMESTAMP}.json; do
        if [ -f "$result_file" ]; then
            local test_name=$(basename "$result_file" "_${TIMESTAMP}.json")
            local html_report="${result_file%.json}.html"
            
            cat >> "$summary_file" << EOF
    <div class="test-result success">
        <h3>$test_name</h3>
        <p><a href="$(basename "$html_report")">View Detailed Report</a></p>
    </div>
EOF
        fi
    done
    
    cat >> "$summary_file" << EOF
    <div class="footer">
        <p><em>Generated by AI Compare Load Testing Suite</em></p>
    </div>
</body>
</html>
EOF
    
    echo -e "${GREEN}✅ Summary report generated: $summary_file${NC}"
}

# Function to cleanup old results
cleanup_old_results() {
    echo -e "${BLUE}🧹 Cleaning up old test results...${NC}"
    
    # Keep only the last 10 test runs
    find "$RESULTS_DIR" -name "*.json" -type f -mtime +7 -delete 2>/dev/null || true
    find "$RESULTS_DIR" -name "*.html" -type f -mtime +7 -delete 2>/dev/null || true
    find "$RESULTS_DIR" -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main execution
main() {
    cleanup_old_results
    
    # Check if Artillery is installed
    if ! command -v artillery &> /dev/null; then
        echo -e "${RED}❌ Artillery is not installed${NC}"
        echo -e "${YELLOW}Please install Artillery: npm install -g artillery${NC}"
        exit 1
    fi
    
    check_services
    setup_test_data
    
    case "$TEST_TYPE" in
        "basic")
            run_test "basic-load-test" "basic-load-test.yml" \
                "Basic load test with normal usage patterns"
            ;;
        "stress")
            if [ "$ENVIRONMENT" = "production" ]; then
                echo -e "${RED}❌ Stress testing not allowed in production${NC}"
                exit 1
            fi
            run_test "stress-test" "stress-test.yml" \
                "High-load stress test to find system limits"
            ;;
        "production")
            run_test "production-load-test" "production-load-test.yml" \
                "Safe production load test with read-only operations"
            ;;
        "discord")
            run_test "discord-bot-simulation" "scenarios/discord-bot-simulation.yml" \
                "Discord bot command and interaction simulation"
            ;;
        "all")
            run_all_tests
            ;;
        *)
            echo -e "${RED}❌ Unknown test type: $TEST_TYPE${NC}"
            echo -e "${YELLOW}Available types: basic, stress, production, discord, all${NC}"
            exit 1
            ;;
    esac
    
    generate_summary
    
    echo -e "${GREEN}🎉 Load testing completed successfully!${NC}"
    echo -e "${GREEN}Results available in: $RESULTS_DIR${NC}"
}

# Show usage if help requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "AI Compare Load Testing Script"
    echo ""
    echo "Usage: $0 [test-type]"
    echo ""
    echo "Test types:"
    echo "  basic      - Basic load test (default)"
    echo "  stress     - High-load stress test"
    echo "  production - Safe production load test"
    echo "  discord    - Discord bot simulation"
    echo "  all        - Run all applicable tests"
    echo ""
    echo "Environment variables:"
    echo "  LOAD_TEST_TARGET       - Target URL (default: http://localhost:3001)"
    echo "  LOAD_TEST_WEB_TARGET   - Web dashboard URL (default: http://localhost:3000)"
    echo "  DISCORD_BOT_TARGET     - Discord bot URL (default: http://localhost:3002)"
    echo "  NODE_ENV               - Environment (test/staging/production)"
    echo ""
    echo "Examples:"
    echo "  $0 basic"
    echo "  LOAD_TEST_TARGET=https://api.aicompare.app $0 production"
    echo "  NODE_ENV=staging $0 all"
    exit 0
fi

main