const { defineConfig } = require('vitest/config');
module.exports = defineConfig({ test:{ globals:true,include:['test/**/*.test.js'],sequence:{concurrent:false},testTimeout:15_000,hookTimeout:15_000 } });
