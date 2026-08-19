-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'O_POS', 'O_NEG', 'AB_POS', 'AB_NEG');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "DonorStatus" AS ENUM ('PROVISIONAL', 'PENDING_REVIEW', 'ACTIVE', 'PERMANENTLY_DEFERRED');

-- CreateEnum
CREATE TYPE "DonationType" AS ENUM ('VOLUNTARY', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "DeferralType" AS ENUM ('TEMPORARY', 'PERMANENT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BLOOD_BANK_STAFF', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "InstitutionCategory" AS ENUM ('IN_HOUSE', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'IVR', 'EMAIL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "institutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InstitutionCategory" NOT NULL,
    "linkedHospitalName" TEXT,
    "pincode" TEXT NOT NULL,
    "address" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donors" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "areaPincode" TEXT NOT NULL,
    "bloodGroupSelfReported" "BloodGroup" NOT NULL,
    "bloodGroupVerified" "BloodGroup",
    "donatedBefore" BOOLEAN NOT NULL DEFAULT false,
    "priorDonationCount" INTEGER,
    "lastDonationDate" TIMESTAMP(3),
    "donationType" "DonationType" NOT NULL DEFAULT 'VOLUNTARY',
    "patientName" TEXT,
    "advisedNotToDonateFlag" BOOLEAN NOT NULL DEFAULT false,
    "status" "DonorStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "deferralUntilDate" TIMESTAMP(3),
    "deferralType" "DeferralType",
    "deferralSetByUserId" TEXT,
    "deferralSetAt" TIMESTAMP(3),
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentPurpose" TEXT NOT NULL,
    "notifyAbnormalResults" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannel" "NotificationChannel" NOT NULL DEFAULT 'SMS',
    "registeredAtCampId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_records" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "institutionId" TEXT NOT NULL,
    "hbValue" DECIMAL(4,1),
    "volumeMl" INTEGER,
    "bloodGroupVerified" "BloodGroup",
    "recordedByUserId" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebaseUid_key" ON "users"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_institutionId_idx" ON "users"("institutionId");

-- CreateIndex
CREATE INDEX "institutions_pincode_idx" ON "institutions"("pincode");

-- CreateIndex
CREATE INDEX "institutions_verificationStatus_idx" ON "institutions"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "donors_firebaseUid_key" ON "donors"("firebaseUid");

-- CreateIndex
CREATE INDEX "donors_bloodGroupSelfReported_areaPincode_idx" ON "donors"("bloodGroupSelfReported", "areaPincode");

-- CreateIndex
CREATE INDEX "donors_status_idx" ON "donors"("status");

-- CreateIndex
CREATE INDEX "donors_phone_idx" ON "donors"("phone");

-- CreateIndex
CREATE INDEX "donation_records_donorId_date_idx" ON "donation_records"("donorId", "date");

-- CreateIndex
CREATE INDEX "donation_records_institutionId_date_idx" ON "donation_records"("institutionId", "date");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donors" ADD CONSTRAINT "donors_deferralSetByUserId_fkey" FOREIGN KEY ("deferralSetByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_records" ADD CONSTRAINT "donation_records_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_records" ADD CONSTRAINT "donation_records_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_records" ADD CONSTRAINT "donation_records_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
