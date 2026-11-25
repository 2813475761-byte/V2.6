'use strict';

const path = require('path');
const express = require('express');
const config = require('./src/config');
const { getDb } = require('./src/repo/db');
const { sessionMiddleware } = require('./src/middleware/session');
const apiRouter = require('./src/routes');

function createApp() {
  getDb();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(sessionMiddleware);
  app.use('/api', apiRouter);

  app.use(
    express.static(config.publicDir, {
      extensions: ['html'],
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
    })
  );

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: '接口不存在' });
    }
    res.sendFile(path.join(config.publicDir, 'index.html'), (error) => {
      if (error) next(error);
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: '资源不存在' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error.status) || 500;
    if (status >= 500) {
      console.error('[server]', error);
    }
    res.status(status).json({
      error: status >= 500 ? '服务器开小差了，请稍后重试' : error.message
    });
  });

  return app;
}

function startServer(port = config.port) {
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`职途罗盘已启动：http://localhost:${port}`);
    console.log('模型通道：', JSON.stringify(require('./src/llm').runtimeInfo()));
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };