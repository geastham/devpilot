#!/bin/bash
# Taskforge API Acceptance Tests
set -o pipefail

BASE_URL="http://localhost:3001"
PASS=0
FAIL=0

echo "=== Taskforge Acceptance Tests ==="

# --- Auth ---
echo ""
echo "--- Auth ---"

ALICE_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.com","password":"password123","name":"Alice"}' \
  $BASE_URL/auth/register)
ALICE_STATUS=$(echo "$ALICE_RESPONSE" | tail -1)
ALICE_BODY=$(echo "$ALICE_RESPONSE" | sed '$d')
if [ "$ALICE_STATUS" = "201" ]; then echo "  PASS: Register Alice"; ((PASS++)); else echo "  FAIL: Register Alice ($ALICE_STATUS)"; ((FAIL++)); fi

ALICE_TOKEN=$(echo "$ALICE_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

LOGIN_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.com","password":"password123"}' \
  $BASE_URL/auth/login)
LOGIN_STATUS=$(echo "$LOGIN_RESPONSE" | tail -1)
if [ "$LOGIN_STATUS" = "200" ]; then echo "  PASS: Login Alice"; ((PASS++)); else echo "  FAIL: Login Alice ($LOGIN_STATUS)"; ((FAIL++)); fi

DUP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.com","password":"password123","name":"Alice2"}' \
  $BASE_URL/auth/register)
if [ "$DUP_STATUS" = "409" ]; then echo "  PASS: Duplicate email rejected"; ((PASS++)); else echo "  FAIL: Duplicate email ($DUP_STATUS)"; ((FAIL++)); fi

BAD_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.com","password":"wrong"}' \
  $BASE_URL/auth/login)
if [ "$BAD_STATUS" = "401" ]; then echo "  PASS: Bad credentials rejected"; ((PASS++)); else echo "  FAIL: Bad creds ($BAD_STATUS)"; ((FAIL++)); fi

# --- Tasks ---
echo ""
echo "--- Tasks ---"

TASK_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"title":"Write docs","description":"API documentation","priority":"high"}' \
  $BASE_URL/tasks)
TASK_STATUS=$(echo "$TASK_RESPONSE" | tail -1)
TASK_BODY=$(echo "$TASK_RESPONSE" | sed '$d')
if [ "$TASK_STATUS" = "201" ]; then echo "  PASS: Create task"; ((PASS++)); else echo "  FAIL: Create task ($TASK_STATUS)"; ((FAIL++)); fi
TASK_ID=$(echo "$TASK_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

NOAUTH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X GET $BASE_URL/tasks)
if [ "$NOAUTH_STATUS" = "401" ]; then echo "  PASS: Unauth rejected"; ((PASS++)); else echo "  FAIL: Unauth ($NOAUTH_STATUS)"; ((FAIL++)); fi

LIST_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X GET \
  -H "Authorization: Bearer $ALICE_TOKEN" $BASE_URL/tasks)
if [ "$LIST_STATUS" = "200" ]; then echo "  PASS: List tasks"; ((PASS++)); else echo "  FAIL: List tasks ($LIST_STATUS)"; ((FAIL++)); fi

UPDATE_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"status":"in_progress"}' \
  $BASE_URL/tasks/$TASK_ID)
if [ "$UPDATE_STATUS" = "200" ]; then echo "  PASS: Valid state transition (todo->in_progress)"; ((PASS++)); else echo "  FAIL: State transition ($UPDATE_STATUS)"; ((FAIL++)); fi

# Move to done, then try invalid transition done->in_progress
curl -s -o /dev/null -X PATCH \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"status":"done"}' \
  $BASE_URL/tasks/$TASK_ID

INVALID_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"status":"in_progress"}' \
  $BASE_URL/tasks/$TASK_ID)
if [ "$INVALID_STATUS" = "422" ]; then echo "  PASS: Invalid transition rejected (done->in_progress)"; ((PASS++)); else echo "  FAIL: Invalid transition ($INVALID_STATUS)"; ((FAIL++)); fi

VALDERR_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"title":""}' \
  $BASE_URL/tasks)
if [ "$VALDERR_STATUS" = "400" ]; then echo "  PASS: Validation error"; ((PASS++)); else echo "  FAIL: Validation ($VALDERR_STATUS)"; ((FAIL++)); fi

# --- Labels ---
echo ""
echo "--- Labels ---"

LABEL_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"name":"bug","color":"#ff0000"}' \
  $BASE_URL/labels)
LABEL_STATUS=$(echo "$LABEL_RESPONSE" | tail -1)
LABEL_BODY=$(echo "$LABEL_RESPONSE" | sed '$d')
if [ "$LABEL_STATUS" = "201" ]; then echo "  PASS: Create label"; ((PASS++)); else echo "  FAIL: Create label ($LABEL_STATUS)"; ((FAIL++)); fi
LABEL_ID=$(echo "$LABEL_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# --- Associations ---
echo ""
echo "--- Associations ---"

ASSOC_TASK_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"title":"Assoc test task"}' \
  $BASE_URL/tasks)
ASSOC_TASK_BODY=$(echo "$ASSOC_TASK_RESPONSE" | sed '$d')
ASSOC_TASK_ID=$(echo "$ASSOC_TASK_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

LINK_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d "{\"labelId\":\"$LABEL_ID\"}" \
  $BASE_URL/tasks/$ASSOC_TASK_ID/labels)
if [ "$LINK_STATUS" = "201" ]; then echo "  PASS: Link label to task"; ((PASS++)); else echo "  FAIL: Link label ($LINK_STATUS)"; ((FAIL++)); fi

TASKLABELS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X GET \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  $BASE_URL/tasks/$ASSOC_TASK_ID/labels)
if [ "$TASKLABELS_STATUS" = "200" ]; then echo "  PASS: Get labels for task"; ((PASS++)); else echo "  FAIL: Get labels ($TASKLABELS_STATUS)"; ((FAIL++)); fi

# --- Webhooks ---
echo ""
echo "--- Webhooks ---"

WH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"url":"http://localhost:9999/webhook","events":["task.created","task.status_changed"]}' \
  $BASE_URL/webhooks)
if [ "$WH_STATUS" = "201" ]; then echo "  PASS: Create webhook"; ((PASS++)); else echo "  FAIL: Create webhook ($WH_STATUS)"; ((FAIL++)); fi

WHLIST_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X GET \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  $BASE_URL/webhooks)
if [ "$WHLIST_STATUS" = "200" ]; then echo "  PASS: List webhooks"; ((PASS++)); else echo "  FAIL: List webhooks ($WHLIST_STATUS)"; ((FAIL++)); fi

# --- Cleanup ---
DEL_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  $BASE_URL/tasks/$ASSOC_TASK_ID)
if [ "$DEL_STATUS" = "204" ]; then echo "  PASS: Delete task"; ((PASS++)); else echo "  FAIL: Delete task ($DEL_STATUS)"; ((FAIL++)); fi

# --- Error Format ---
echo ""
echo "--- Error Format ---"

ERR_BODY=$(curl -s -X GET $BASE_URL/tasks)
HAS_ERROR=$(echo "$ERR_BODY" | grep -c '"error"')
HAS_MESSAGE=$(echo "$ERR_BODY" | grep -c '"message"')
if [ "$HAS_ERROR" -gt 0 ] && [ "$HAS_MESSAGE" -gt 0 ]; then
    echo "  PASS: Consistent error format"
    ((PASS++))
else
    echo "  FAIL: Error format missing fields"
    ((FAIL++))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
