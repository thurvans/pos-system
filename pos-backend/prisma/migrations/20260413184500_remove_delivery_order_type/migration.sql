UPDATE "orders"
SET "order_type" = 'TAKE_AWAY'
WHERE "order_type" = 'DELIVERY';

ALTER TABLE "orders"
ALTER COLUMN "order_type" DROP DEFAULT;

CREATE TYPE "OrderType_new" AS ENUM ('DINE_IN', 'TAKE_AWAY');

ALTER TABLE "orders"
ALTER COLUMN "order_type" TYPE "OrderType_new"
USING ("order_type"::text::"OrderType_new");

DROP TYPE "OrderType";

ALTER TYPE "OrderType_new" RENAME TO "OrderType";

ALTER TABLE "orders"
ALTER COLUMN "order_type" SET DEFAULT 'DINE_IN'::"OrderType";
