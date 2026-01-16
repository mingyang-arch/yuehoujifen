const express = require('express');
const { nanoid } = require('nanoid');
const path = require('path');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;
const BCRYPT_ROUNDS = 10;

// 过期时间选项
const EXPIRY_OPTIONS = {
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

// 内存存储
const secrets = new Map();

// 限流配置
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'RATE_LIMITED', message: '创建过于频繁，请稍后再试' }
});

const viewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'RATE_LIMITED', message: '请求过于频繁' }
});

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// 安全头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// 验证错误处理
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: errors.array()[0].msg
    });
  }
  next();
};

// 创建秘密
app.post('/api/secret',
  createLimiter,
  body('ciphertext').notEmpty().withMessage('密文不能为空'),
  body('iv').notEmpty().withMessage('IV不能为空'),
  body('expiresIn').isIn(['5m', '1h', '24h', '7d']).withMessage('无效的过期时间'),
  body('maxViews').isInt({ min: 1, max: 10 }).withMessage('查看次数必须在1-10之间'),
  body('contentType').optional().isIn(['text', 'image']).withMessage('无效的内容类型'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { ciphertext, iv, salt, passwordHash, expiresIn, maxViews, contentType } = req.body;

      const id = nanoid(10);
      const expiresAt = new Date(Date.now() + EXPIRY_OPTIONS[expiresIn]);

      // 如果有密码，用bcrypt加密存储
      let storedPasswordHash = null;
      if (passwordHash) {
        storedPasswordHash = await bcrypt.hash(passwordHash, BCRYPT_ROUNDS);
      }

      secrets.set(id, {
        ciphertext,
        iv,
        salt: salt || null,
        passwordHash: storedPasswordHash,
        expiresAt,
        createdAt: new Date(),
        maxViews: parseInt(maxViews),
        viewCount: 0,
        contentType: contentType || 'text'
      });

      res.status(201).json({ id, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      console.error('创建秘密错误:', error);
      res.status(500).json({ error: 'SERVER_ERROR', message: '服务器错误' });
    }
  }
);

// 获取秘密元数据
app.get('/api/secret/:id/meta',
  viewLimiter,
  param('id').isLength({ min: 10, max: 10 }),
  handleValidationErrors,
  (req, res) => {
    const { id } = req.params;

    if (!secrets.has(id)) {
      return res.status(404).json({
        error: 'SECRET_NOT_FOUND',
        message: '秘密不存在或已过期'
      });
    }

    const secret = secrets.get(id);

    // 检查是否过期
    if (new Date() > secret.expiresAt) {
      secrets.delete(id);
      return res.status(404).json({
        error: 'SECRET_NOT_FOUND',
        message: '秘密已过期'
      });
    }

    // 检查查看次数
    if (secret.viewCount >= secret.maxViews) {
      secrets.delete(id);
      return res.status(410).json({
        error: 'SECRET_EXHAUSTED',
        message: '秘密查看次数已用完'
      });
    }

    res.json({
      hasPassword: !!secret.passwordHash,
      expiresAt: secret.expiresAt.toISOString(),
      remainingViews: secret.maxViews - secret.viewCount,
      maxViews: secret.maxViews,
      contentType: secret.contentType || 'text'
    });
  }
);

// 查看秘密
app.post('/api/secret/:id/view',
  viewLimiter,
  param('id').isLength({ min: 10, max: 10 }),
  handleValidationErrors,
  async (req, res) => {
    const { id } = req.params;
    const { passwordHash } = req.body;

    if (!secrets.has(id)) {
      return res.status(404).json({
        error: 'SECRET_NOT_FOUND',
        message: '秘密不存在或已被销毁'
      });
    }

    const secret = secrets.get(id);

    // 检查是否过期
    if (new Date() > secret.expiresAt) {
      secrets.delete(id);
      return res.status(404).json({
        error: 'SECRET_NOT_FOUND',
        message: '秘密已过期'
      });
    }

    // 检查查看次数
    if (secret.viewCount >= secret.maxViews) {
      secrets.delete(id);
      return res.status(410).json({
        error: 'SECRET_EXHAUSTED',
        message: '秘密查看次数已用完'
      });
    }

    // 验证密码
    if (secret.passwordHash) {
      if (!passwordHash) {
        return res.status(401).json({
          error: 'PASSWORD_REQUIRED',
          message: '此秘密需要密码'
        });
      }

      const isValid = await bcrypt.compare(passwordHash, secret.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          error: 'INVALID_PASSWORD',
          message: '密码错误'
        });
      }
    }

    // 增加查看计数
    secret.viewCount++;
    const remainingViews = secret.maxViews - secret.viewCount;
    const destroyed = remainingViews === 0;

    // 准备响应数据
    const response = {
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      salt: secret.salt,
      remainingViews,
      expiresAt: secret.expiresAt.toISOString(),
      destroyed,
      contentType: secret.contentType || 'text'
    };

    // 如果是最后一次查看，删除秘密
    if (destroyed) {
      secrets.delete(id);
    }

    res.json(response);
  }
);

// 兼容旧API - 获取秘密（一次性）
app.get('/api/secret/:id', (req, res) => {
  const { id } = req.params;

  if (!secrets.has(id)) {
    return res.status(404).json({ error: '秘密不存在或已被读取' });
  }

  const secret = secrets.get(id);

  // 检查过期
  if (new Date() > secret.expiresAt) {
    secrets.delete(id);
    return res.status(404).json({ error: '秘密已过期' });
  }

  // 旧API返回明文(兼容)或密文(新版)
  secrets.delete(id);

  if (secret.content) {
    // 旧格式
    res.json({ content: secret.content });
  } else {
    // 新格式
    res.json({
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      salt: secret.salt
    });
  }
});

// 秘密查看页面
app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// 主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 定期清理过期秘密
setInterval(() => {
  const now = new Date();
  for (const [id, secret] of secrets.entries()) {
    if (now > secret.expiresAt) {
      secrets.delete(id);
      console.log(`已清理过期秘密: ${id}`);
    }
  }
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
