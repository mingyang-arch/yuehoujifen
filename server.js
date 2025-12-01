const express = require('express');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 内存存储（生产环境建议使用 Redis）
const secrets = new Map();

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 创建秘密
app.post('/api/secret', (req, res) => {
  const { content } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: '秘密内容不能为空' });
  }

  // 生成唯一ID
  const id = nanoid(10);

  // 存储秘密
  secrets.set(id, {
    content: content,
    createdAt: new Date()
  });

  // 返回链接
  const url = `${req.protocol}://${req.get('host')}/s/${id}`;
  res.json({ url });
});

// 获取秘密（一次性）
app.get('/api/secret/:id', (req, res) => {
  const { id } = req.params;

  if (!secrets.has(id)) {
    return res.status(404).json({ error: '秘密不存在或已被读取' });
  }

  // 获取并立即删除
  const secret = secrets.get(id);
  secrets.delete(id);

  res.json({ content: secret.content });
});

// 秘密查看页面
app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// 主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 定期清理过期秘密（24小时未读取）
setInterval(() => {
  const now = new Date();
  for (const [id, secret] of secrets.entries()) {
    const hoursSinceCreation = (now - secret.createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      secrets.delete(id);
      console.log(`已清理过期秘密: ${id}`);
    }
  }
}, 60 * 60 * 1000); // 每小时检查一次

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
