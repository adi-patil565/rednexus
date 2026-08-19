/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@rednexus/api',
    '@rednexus/store',
    '@rednexus/validators',
    '@rednexus/utils',
    '@rednexus/types',
    '@rednexus/design-tokens',
  ],
};

module.exports = nextConfig;
