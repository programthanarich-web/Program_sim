#!/usr/bin/env bash
# =====================================================================
# รันการทดสอบ migration และสิทธิ์ (RLS) บนฐานข้อมูล PostgreSQL ที่สร้างใหม่
#
# การใช้งาน:
#   PSQL="psql -h localhost -U postgres" ./supabase/tests/run.sh
#
# ตัวแปร:
#   PSQL     คำสั่ง psql ที่เชื่อมต่อได้ (ค่าเริ่มต้น: psql)
#   TEST_DB  ชื่อฐานข้อมูลทดสอบ (ค่าเริ่มต้น: thanarich_test) จะถูกลบและสร้างใหม่ทุกครั้ง
#
# ขั้นตอน: stub (จำลอง Supabase) -> migrations ตามลำดับชื่อไฟล์ -> harness -> ชุดทดสอบ
# ถ้ามีรายการไม่ผ่าน สคริปต์จะจบด้วย exit code ที่ไม่ใช่ 0
# =====================================================================
set -euo pipefail

SUPA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="${TEST_DB:-thanarich_test}"
PSQL_BIN="${PSQL:-psql}"

run_psql() {
  # shellcheck disable=SC2086
  $PSQL_BIN -X -q -v ON_ERROR_STOP=1 "$@"
}

echo "==> สร้างฐานข้อมูลทดสอบ: $DB"
run_psql -d postgres -c "DROP DATABASE IF EXISTS $DB;" >/dev/null
run_psql -d postgres -c "CREATE DATABASE $DB;" >/dev/null

echo "==> โหลด stub จำลอง Supabase (เฉพาะการทดสอบ local)"
run_psql -d "$DB" -f "$SUPA_DIR/tests/support/00_local_supabase_stub.sql"

echo "==> รัน migrations"
for migration in "$SUPA_DIR"/migrations/*.sql; do
  echo "    - $(basename "$migration")"
  run_psql -d "$DB" -f "$migration"
done

echo "==> โหลด test harness"
run_psql -d "$DB" -f "$SUPA_DIR/tests/support/01_harness.sql"

echo "==> รันชุดทดสอบสิทธิ์และความสมบูรณ์ของข้อมูล"
run_psql -d "$DB" -f "$SUPA_DIR/tests/permissions.test.sql"
echo "==> รันชุดทดสอบ admin operations"
run_psql -d "$DB" -f "$SUPA_DIR/tests/admin_operations.test.sql"
echo "==> รันชุดทดสอบค่ารับเงิน"
run_psql -d "$DB" -f "$SUPA_DIR/tests/payment_receiving.test.sql"

echo "==> เสร็จสิ้น"
