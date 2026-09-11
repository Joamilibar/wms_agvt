export default () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let redisHost = 'localhost';
  let redisPort = 6379;
  let redisPassword: string | undefined;

  try {
    const url = new URL(redisUrl);
    redisHost = url.hostname;
    redisPort = parseInt(url.port, 10) || 6379;
    redisPassword = url.password || undefined;
  } catch {
    // fallback defaults
  }

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/wms_pro',
    },
    redis: {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      url: redisUrl,
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      // M-08: the access token is short-lived now; the 7 days moved to the
      // refresh token, which is revocable. JWT_EXPIRES_IN is no longer read —
      // it used to give every session a 7-day bearer token with no way back.
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    bsale: {
      baseUrl: process.env.BSALE_BASE_URL || 'https://api.bsale.cl/v1',
      token: process.env.BSALE_TOKEN || '',
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    seed: {
      adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@cabodehornos.cl',
      adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
    },
  };
};
