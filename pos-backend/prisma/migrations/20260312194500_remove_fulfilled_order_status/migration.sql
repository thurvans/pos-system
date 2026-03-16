UPDATE "order_cancellation_logs"
SET "previous_status" = 'PAID'
WHERE "previous_status" = 'FULFILLED';

UPDATE "order_status_histories"
SET "from_status" = 'PAID'
WHERE "from_status" = 'FULFILLED';

UPDATE "order_status_histories"
SET "to_status" = 'PAID'
WHERE "to_status" = 'FULFILLED';

UPDATE "orders"
SET "status" = 'PAID'
WHERE "status" = 'FULFILLED';

ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'VOID');

ALTER TABLE "orders"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "OrderStatus"
USING ("status"::text::"OrderStatus");

ALTER TABLE "order_status_histories"
ALTER COLUMN "from_status" TYPE "OrderStatus"
USING (
  CASE
    WHEN "from_status" IS NULL THEN NULL
    ELSE "from_status"::text::"OrderStatus"
  END
),
ALTER COLUMN "to_status" TYPE "OrderStatus"
USING ("to_status"::text::"OrderStatus");

ALTER TABLE "order_cancellation_logs"
ALTER COLUMN "previous_status" TYPE "OrderStatus"
USING ("previous_status"::text::"OrderStatus");

ALTER TABLE "orders"
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "OrderStatus_old";
