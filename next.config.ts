import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* 여기에 최상위(Root) 속성으로 넣어야 합니다 */
  allowedDevOrigins: [
    '192.168.1.237',
    '192.168.1.237:3000',
    'localhost:3000',
    '*.local'
  ]
};

export default nextConfig;