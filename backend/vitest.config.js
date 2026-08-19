import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // These are integration tests against ONE real Postgres database.
    // Running files in parallel lets them clobber each other's fixtures
    // - a request test writing a threshold for mgm_kamothe made the
    // threshold tests read a value they never set.
    //
    // Isolated schemas per worker would allow parallelism, but at this
    // suite size (~3s serial) that is complexity bought for nothing.
    fileParallelism: false,

    // Pure-logic files could run in parallel, but splitting the suite in
    // two to save a second is not worth the config.
    sequence: { concurrent: false },

    include: ['src/tests/**/*.test.js'],
  },
});
