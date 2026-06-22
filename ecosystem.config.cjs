module.exports = {
  apps: [
    {
      name: 'hirevan-scraper',
      script: 'scripts/run-scraper.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      args: '--schedule',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_file: 'logs/pm2-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 5,
      restart_delay: 10000,
      autorestart: true,
    },
  ],
};