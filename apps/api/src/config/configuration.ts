export default () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
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
    nodeEnv,
    seed: {
      adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@cabodehornos.cl',
      // A-09: no default password in production. The fallback exists so a dev
      // clone boots with zero config; in production an empty database with no
      // SEED_ADMIN_PASSWORD fails fast instead of shipping a known credential.
      adminPassword: process.env.SEED_ADMIN_PASSWORD || (isProduction ? '' : 'Admin123!'),
      // Demo lots, orders, guides and the two operator accounts. Never in
      // production unless asked for explicitly.
      demoData: process.env.SEED_DEMO_DATA
        ? process.env.SEED_DEMO_DATA === 'true'
        : !isProduction,
      operatorPassword: process.env.SEED_OPERATOR_PASSWORD || 'Operador123!',
    },
  };
};
