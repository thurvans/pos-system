ALTER TABLE "order_items"
ADD COLUMN "order_batch_number" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "order_items"
ADD COLUMN "kitchen_printed_at" TIMESTAMP(3);
