-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "dispatch_workflows" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "shipment_id" UUID NOT NULL,
    "shipment_tracking" TEXT NOT NULL,
    "started" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_failure_modes" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "trend" TEXT NOT NULL DEFAULT 'flat',
    "samples" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_failure_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_workflow_audit" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "from_step" TEXT,
    "to_step" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_workflow_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_workflows_code_key" ON "dispatch_workflows"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_workflow_audit_idempotency_key_key" ON "dispatch_workflow_audit"("idempotency_key");

-- CreateIndex
CREATE INDEX "dispatch_workflow_audit_workflow_idx" ON "dispatch_workflow_audit"("workflow_id", "created_at" DESC);

