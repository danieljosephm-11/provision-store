-- CreateEnum
CREATE TYPE "CustomerActivityType" AS ENUM ('NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED');

-- DropIndex
DROP INDEX "Customer_mobile_trgm_idx";

-- DropIndex
DROP INDEX "Customer_name_trgm_idx";

-- DropIndex
DROP INDEX "Invoice_fy_idx";

-- DropIndex
DROP INDEX "Invoice_store_status_date_idx";

-- DropIndex
DROP INDEX "Product_name_trgm_idx";

-- DropIndex
DROP INDEX "Product_sku_trgm_idx";

-- DropIndex
DROP INDEX "Supplier_name_trgm_idx";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "anniversary" DATE,
ADD COLUMN     "birthday" DATE,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CustomerActivity" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "CustomerActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCampaign" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "message" TEXT NOT NULL,
    "segment" "CustomerSegment",
    "minSpend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "inactiveDays" INTEGER NOT NULL DEFAULT 0,
    "includeInactive" BOOLEAN NOT NULL DEFAULT false,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerActivity_storeId_dueAt_idx" ON "CustomerActivity"("storeId", "dueAt");

-- CreateIndex
CREATE INDEX "CustomerActivity_customerId_createdAt_idx" ON "CustomerActivity"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerCampaign_storeId_status_idx" ON "CustomerCampaign"("storeId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_customerId_key" ON "CampaignRecipient"("campaignId", "customerId");

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCampaign" ADD CONSTRAINT "CustomerCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCampaign" ADD CONSTRAINT "CustomerCampaign_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CustomerCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
