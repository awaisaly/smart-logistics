-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "warehouse_records" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "util" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lanes" INTEGER NOT NULL DEFAULT 0,
    "inbound" INTEGER NOT NULL DEFAULT 0,
    "outbound" INTEGER NOT NULL DEFAULT 0,
    "throughput" TEXT NOT NULL DEFAULT '0%',
    "stock_low" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_lane_occupancy" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "lane_index" INTEGER NOT NULL,
    "occupancy_pct" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_lane_occupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_stock_items" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "threshold_value" INTEGER NOT NULL DEFAULT 0,
    "hot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_records_code_key" ON "warehouse_records"("code");

