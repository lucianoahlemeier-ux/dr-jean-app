/** @type {import('next').NextConfig} */
const nextConfig = {
  // The upload route accepts a WhatsApp .zip; allow a generous body size for
  // the Server Action / route handler parsing path.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
