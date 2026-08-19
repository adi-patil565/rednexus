-- CreateTable
CREATE TABLE "camps" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeNote" TEXT,
    "location" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_attendances" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camp_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "camps_date_idx" ON "camps"("date");

-- CreateIndex
CREATE INDEX "camps_institutionId_date_idx" ON "camps"("institutionId", "date");

-- CreateIndex
CREATE INDEX "camps_pincode_date_idx" ON "camps"("pincode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "camp_attendances_campId_donorId_key" ON "camp_attendances"("campId", "donorId");

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_attendances" ADD CONSTRAINT "camp_attendances_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_attendances" ADD CONSTRAINT "camp_attendances_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
