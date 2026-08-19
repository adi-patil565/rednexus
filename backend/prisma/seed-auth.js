// Create Firebase Auth logins for the seeded staff fixtures.
//
// Separate from db:seed on purpose. This one creates real, usable
// credentials in your Firebase project, so it is an explicit, opt-in
// command rather than something that happens as a side effect of
// seeding the database.
//
//   npm run db:seed:auth        (from backend/)
//
// It links each Firebase account to the Postgres user by setting the
// Firebase uid to the fixture's firebaseUid, which is how the API
// resolves identity to authority.
//
// LOCAL DEVELOPMENT ONLY. Every account gets the same well-known
// password, printed below. Never run this against a project that has
// real users, and never deploy with these accounts present.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';

const DEV_PASSWORD = 'RaktasetuDev#2026';

const keyPath = resolve(process.cwd(), 'serviceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error(
    '\nserviceAccountKey.json not found in backend/.\n' +
      'Download one from Firebase Console > Project Settings > Service Accounts.\n'
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const prisma = new PrismaClient();

async function main() {
  console.log(`\nCreating Firebase logins in project ${serviceAccount.project_id}\n`);

  const users = await prisma.user.findMany({
    include: { institution: { select: { name: true, verificationStatus: true } } },
    orderBy: { role: 'asc' },
  });

  if (users.length === 0) {
    console.error('No users in Postgres. Run `npm run db:seed` first.');
    process.exit(1);
  }

  for (const user of users) {
    try {
      // Setting uid explicitly is what ties the Firebase account to the
      // Postgres row. Without it the API would authenticate the person
      // and then fail to find them.
      await admin.auth().createUser({
        uid: user.firebaseUid,
        email: user.email,
        password: DEV_PASSWORD,
        displayName: user.name,
        emailVerified: true,
      });
      console.log(`  created   ${user.email}`);
    } catch (error) {
      if (error.code === 'auth/uid-already-exists' || error.code === 'auth/email-already-exists') {
        await admin.auth().updateUser(user.firebaseUid, { password: DEV_PASSWORD });
        console.log(`  reset     ${user.email}`);
      } else {
        console.error(`  FAILED    ${user.email}: ${error.message}`);
      }
    }
  }

  console.log(`\n  Password for every account: ${DEV_PASSWORD}\n`);
  console.log('  Sign in with one of these:\n');
  for (const user of users) {
    const where =
      user.role === 'PLATFORM_ADMIN'
        ? 'platform admin'
        : `${user.institution?.name} (${user.institution?.verificationStatus})`;
    console.log(`    ${user.email.padEnd(38)} ${where}`);
  }
  console.log(
    '\n  Only MGM Hospital Blood Bank is VERIFIED, so only its staff\n' +
      '  can report usage and confirm thresholds. That is deliberate:\n' +
      '  it is how the verification gate stays testable.\n'
  );
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
