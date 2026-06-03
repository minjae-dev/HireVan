const nextConfig = {
  // 🎯 원래 적혀있던 민재님의 기존 설정들 (images, webpack 등)은 그대로 유지하고!
  reactStrictMode: true,
  
  // 🎯 여기에 이 에센셜 옵션만 추가해 주는 것입니다.
  experimental: {
    appDir: true, 
  },
};

export default nextConfig;