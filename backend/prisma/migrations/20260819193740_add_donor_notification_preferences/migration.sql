-- AlterTable
ALTER TABLE "donors" ADD COLUMN     "monthlyNotificationCap" INTEGER,
ADD COLUMN     "notificationsPaused" BOOLEAN NOT NULL DEFAULT false;
