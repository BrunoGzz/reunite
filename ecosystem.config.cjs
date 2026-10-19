// One instance only: sessions are kept in memory, so cluster mode would log people out at random.
module.exports = {
  apps: [{
    name: 'reunite',
    script: 'server/index.js',
    cwd: '/var/www/reunite',
    env: { NODE_ENV: 'production', PORT: 3100 },
    max_memory_restart: '300M',
  }],
}
