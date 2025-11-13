module.exports = {
  apps: [
    {
      name: "whatsapp-bot",
      script: "./server.js",
      cwd: "/opt/whatsapp-bot",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        VERIFY_TOKEN: "my_secure_token_DL956433Yy09edu5683"
      }
    }
  ]
};
