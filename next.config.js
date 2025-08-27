/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Increase the body size limit for large PDFs
    },
  },
}

module.exports = nextConfig
