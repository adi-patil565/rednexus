-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "date" DATE NOT NULL,
    "unitsIssued" INTEGER NOT NULL,
    "stockOnHand" INTEGER NOT NULL,
    "prbcUnits" INTEGER,
    "ffpUnits" INTEGER,
    "plateletUnits" INTEGER,
    "reportedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_records_institutionId_date_idx" ON "usage_records"("institutionId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_institutionId_bloodGroup_date_key" ON "usage_records"("institutionId", "bloodGroup", "date");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
