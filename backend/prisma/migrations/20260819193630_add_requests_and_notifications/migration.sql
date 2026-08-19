-- CreateEnum
CREATE TYPE "RequestOrigin" AS ENUM ('SCHEDULED', 'THRESHOLD_BREACH', 'MANUAL');

-- CreateEnum
CREATE TYPE "RequestState" AS ENUM ('DETECTED', 'RAISED', 'NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationResponse" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "unitsNeeded" INTEGER NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "origin" "RequestOrigin" NOT NULL,
    "state" "RequestState" NOT NULL DEFAULT 'DETECTED',
    "detectionBasis" TEXT,
    "stockAtDetection" INTEGER,
    "thresholdAtDetection" INTEGER,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "stageLevel" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "stage" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response" "NotificationResponse" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "rankScore" DECIMAL(6,3),

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requests_institutionId_state_idx" ON "requests"("institutionId", "state");

-- CreateIndex
CREATE INDEX "requests_state_idx" ON "requests"("state");

-- CreateIndex
CREATE INDEX "notification_logs_donorId_sentAt_idx" ON "notification_logs"("donorId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_requestId_donorId_key" ON "notification_logs"("requestId", "donorId");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
