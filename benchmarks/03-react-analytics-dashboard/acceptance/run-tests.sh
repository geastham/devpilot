#!/bin/bash
# InsightBoard End-to-End Acceptance Tests
set -o pipefail

PASS=0
FAIL=0

check() {
    local desc="$1"
    local condition="$2"
    if eval "$condition" 2>/dev/null; then
        echo "  PASS: $desc"
        ((PASS++))
    else
        echo "  FAIL: $desc"
        ((FAIL++))
    fi
}

echo "=== InsightBoard Acceptance Tests ==="

# --- Phase 1: Pipeline ---
echo ""
echo "--- Data Pipeline ---"

node src/pipeline/index.js 2>/dev/null
PIPELINE_EXIT=$?
check "Pipeline runs without error" "[ $PIPELINE_EXIT -eq 0 ]"
check "Database file created" "[ -f ./data/insightboard.db ]"

PRODUCT_COUNT=$(sqlite3 ./data/insightboard.db "SELECT COUNT(*) FROM products;" 2>/dev/null)
CUSTOMER_COUNT=$(sqlite3 ./data/insightboard.db "SELECT COUNT(*) FROM customers;" 2>/dev/null)
ORDER_COUNT=$(sqlite3 ./data/insightboard.db "SELECT COUNT(*) FROM orders;" 2>/dev/null)

check "Products loaded (expect 15)" "[ '$PRODUCT_COUNT' = '15' ]"
check "Customers loaded (expect 15)" "[ '$CUSTOMER_COUNT' = '15' ]"
check "Orders loaded (expect 49-50)" "[ '$ORDER_COUNT' -ge 49 ] && [ '$ORDER_COUNT' -le 50 ]"

REFUNDED=$(sqlite3 ./data/insightboard.db "SELECT COUNT(*) FROM orders WHERE status='refunded';" 2>/dev/null)
check "Refunded orders preserved (expect 3)" "[ '$REFUNDED' = '3' ]"

# --- Phase 2: API ---
echo ""
echo "--- API Server ---"

node src/api/server.js &
API_PID=$!
sleep 2

API_URL="http://localhost:3002/api"

HEALTH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' $API_URL/health)
check "API health check" "[ '$HEALTH_STATUS' = '200' ]"

SUMMARY=$(curl -s "$API_URL/summary?start_date=2024-01-01&end_date=2024-05-31")
check "Summary endpoint returns data" "echo '$SUMMARY' | grep -q 'totalRevenue'"
check "Summary has meta" "echo '$SUMMARY' | grep -q 'startDate'"

REVENUE=$(curl -s "$API_URL/revenue?start_date=2024-01-01&end_date=2024-05-31")
check "Revenue endpoint returns array" "echo '$REVENUE' | grep -q 'data'"
REVENUE_POINTS=$(echo "$REVENUE" | grep -o '"date"' | wc -l)
check "Revenue has multiple data points" "[ $REVENUE_POINTS -gt 5 ]"

PRODUCTS=$(curl -s "$API_URL/products?start_date=2024-01-01&end_date=2024-05-31&limit=5")
check "Products endpoint returns data" "echo '$PRODUCTS' | grep -q 'revenue'"
PROD_COUNT=$(echo "$PRODUCTS" | grep -o '"name"' | wc -l)
check "Products respects limit=5" "[ $PROD_COUNT -le 5 ]"

CUSTOMERS=$(curl -s "$API_URL/customers?start_date=2024-01-01&end_date=2024-05-31")
check "Customers endpoint returns segments" "echo '$CUSTOMERS' | grep -q 'segment'"
check "Has enterprise segment" "echo '$CUSTOMERS' | grep -q 'enterprise'"
check "Has smb segment" "echo '$CUSTOMERS' | grep -q 'smb'"

CHANNELS=$(curl -s "$API_URL/channels?start_date=2024-01-01&end_date=2024-05-31")
check "Channels endpoint returns data" "echo '$CHANNELS' | grep -q 'channel'"
check "Has organic channel" "echo '$CHANNELS' | grep -q 'organic'"
check "Has paid_search channel" "echo '$CHANNELS' | grep -q 'paid_search'"

NARROW=$(curl -s "$API_URL/revenue?start_date=2024-03-01&end_date=2024-03-31")
NARROW_POINTS=$(echo "$NARROW" | grep -o '"date"' | wc -l)
check "Date filter narrows results" "[ $NARROW_POINTS -lt $REVENUE_POINTS ]"

kill $API_PID 2>/dev/null

# --- Phase 3: Frontend ---
echo ""
echo "--- Frontend ---"

check "App.jsx exists" "[ -f src/frontend/App.jsx ]"
check "KPICards component exists" "[ -f src/frontend/components/KPICards.jsx ]"
check "RevenueChart component exists" "[ -f src/frontend/components/RevenueChart.jsx ]"
check "ProductChart component exists" "[ -f src/frontend/components/ProductChart.jsx ]"
check "CustomerChart component exists" "[ -f src/frontend/components/CustomerChart.jsx ]"
check "ChannelChart component exists" "[ -f src/frontend/components/ChannelChart.jsx ]"
check "DateFilter component exists" "[ -f src/frontend/components/DateFilter.jsx ]"
check "useAnalytics hook exists" "[ -f src/frontend/hooks/useAnalytics.js ]"
check "Vite config exists" "[ -f vite.config.js ]"

check "RevenueChart uses Recharts" "grep -q 'recharts' src/frontend/components/RevenueChart.jsx"
check "ProductChart uses Recharts" "grep -q 'recharts' src/frontend/components/ProductChart.jsx"
check "CustomerChart uses Recharts" "grep -q 'recharts' src/frontend/components/CustomerChart.jsx"
check "ChannelChart uses Recharts" "grep -q 'recharts' src/frontend/components/ChannelChart.jsx"

check "DateFilter exports context" "grep -q 'Context' src/frontend/components/DateFilter.jsx"
check "useAnalytics handles loading state" "grep -q 'loading' src/frontend/hooks/useAnalytics.js"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
