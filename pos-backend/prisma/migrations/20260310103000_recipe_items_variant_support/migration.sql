ALTER TABLE "recipe_items"
ADD COLUMN "variant_id" TEXT;

DROP INDEX IF EXISTS "recipe_items_product_id_ingredient_id_key";

CREATE INDEX "recipe_items_product_id_variant_id_idx"
ON "recipe_items"("product_id", "variant_id");

CREATE INDEX "recipe_items_variant_id_idx"
ON "recipe_items"("variant_id");

CREATE UNIQUE INDEX "recipe_items_product_base_ingredient_key"
ON "recipe_items"("product_id", "ingredient_id")
WHERE "variant_id" IS NULL;

CREATE UNIQUE INDEX "recipe_items_product_variant_ingredient_key"
ON "recipe_items"("product_id", "variant_id", "ingredient_id")
WHERE "variant_id" IS NOT NULL;

ALTER TABLE "recipe_items"
ADD CONSTRAINT "recipe_items_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
