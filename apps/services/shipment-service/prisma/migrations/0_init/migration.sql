-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "shipment_records" (
    "id" UUID NOT NULL,
    "tracking_number" TEXT NOT NULL,
    "from_warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID NOT NULL,
    "from_code" TEXT NOT NULL,
    "to_code" TEXT NOT NULL,
    "courier_id" UUID NOT NULL,
    "courier_code" TEXT NOT NULL,
    "weight" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "placed" TEXT NOT NULL,
    "eta" TEXT NOT NULL,
    "risk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "items" INTEGER NOT NULL DEFAULT 1,
    "transit_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_returns" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "shipment_id" UUID NOT NULL,
    "shipment_tracking" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "initiated" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "refund" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_exceptions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "shipment_id" UUID NOT NULL,
    "shipment_tracking" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "age" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_timelines" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "t" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "descr" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_timelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_audits_v2" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "t" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_audits_v2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_records_tracking_number_key" ON "shipment_records"("tracking_number");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_returns_code_key" ON "shipment_returns"("code");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_exceptions_code_key" ON "shipment_exceptions"("code");

