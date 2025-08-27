/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    // Enable edge runtime for better performance with large files
    runtime: 'nodejs',
  },
  api: {
    bodyParser: {
      sizeLimit: '500mb', // Much larger limit for PDFs
    },
    responseLimit: false,
  },
}

module.exports = nextConfig
