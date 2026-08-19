-- CreateEnum
CREATE TYPE "ThresholdConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "blood_group_thresholds" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "proposedThreshold" INTEGER NOT NULL,
    "proposedCollectionTarget" INTEGER NOT NULL,
    "meanDailyUsage" DECIMAL(8,2) NOT NULL,
    "stdDevDailyUsage" DECIMAL(8,2) NOT NULL,
    "computationBasis" TEXT NOT NULL,
    "daysOfData" INTEGER NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "confidence" "ThresholdConfidence" NOT NULL,
    "confirmedThreshold" INTEGER,
    "confirmedCollectionTarget" INTEGER,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "wasEdited" BOOLEAN NOT NULL DEFAULT false,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blood_group_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blood_group_thresholds_institutionId_idx" ON "blood_group_thresholds"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "blood_group_thresholds_institutionId_bloodGroup_key" ON "blood_group_thresholds"("institutionId", "bloodGroup");

-- AddForeignKey
ALTER TABLE "blood_group_thresholds" ADD CONSTRAINT "blood_group_thresholds_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_group_thresholds" ADD CONSTRAINT "blood_group_thresholds_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
