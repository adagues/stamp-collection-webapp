/** @type {import('next').NextConfig} */
const config = {
  experimental: { serverComponentsExternalPackages: ['@libsql/client'], cpus: 2 },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, sharp: false, 'onnxruntime-node': false };
    return config;
  },
};
export default config;
