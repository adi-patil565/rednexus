-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('PENDING_SCREENING', 'RELEASED', 'DISCARDED');

-- AlterTable
ALTER TABLE "donation_records" ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "screenedByUserId" TEXT,
ADD COLUMN     "screeningStatus" "ScreeningStatus" NOT NULL DEFAULT 'PENDING_SCREENING',
ADD COLUMN     "unitsContributed" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "donation_records_institutionId_screeningStatus_releasedAt_idx" ON "donation_records"("institutionId", "screeningStatus", "releasedAt");

-- AddForeignKey
ALTER TABLE "donation_records" ADD CONSTRAINT "donation_records_screenedByUserId_fkey" FOREIGN KEY ("screenedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
