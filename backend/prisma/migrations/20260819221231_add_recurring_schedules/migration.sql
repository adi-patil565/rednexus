-- CreateEnum
CREATE TYPE "TransfusionFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'EVERY_SIX_WEEKS');

-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "recurringScheduleId" TEXT;

-- CreateTable
CREATE TABLE "recurring_schedules" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "unitsPerVisit" INTEGER NOT NULL DEFAULT 1,
    "frequency" "TransfusionFrequency" NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 7,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "endedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_schedules_institutionId_active_idx" ON "recurring_schedules"("institutionId", "active");

-- CreateIndex
CREATE INDEX "recurring_schedules_nextDueDate_idx" ON "recurring_schedules"("nextDueDate");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_recurringScheduleId_fkey" FOREIGN KEY ("recurringScheduleId") REFERENCES "recurring_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
