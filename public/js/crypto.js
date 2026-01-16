/**
 * 客户端加密模块 - AES-256-GCM
 * 支持文本和二进制数据（图片）加密
 */
const CryptoUtils = {
  // 支持的图片类型
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  MAX_FILE_SIZE: 2 * 1024 * 1024, // 2MB

  /**
   * 生成随机字节
   */
  getRandomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  },

  /**
   * Base64 编码
   */
  toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  /**
   * Base64 解码
   */
  fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  /**
   * Base64URL 编码 (用于URL hash)
   */
  toBase64URL(buffer) {
    return this.toBase64(buffer)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  },

  /**
   * Base64URL 解码
   */
  fromBase64URL(base64url) {
    let base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return this.fromBase64(base64);
  },

  /**
   * 加密内容
   * @param {string} plaintext - 明文
   * @param {string|null} password - 可选密码
   * @returns {Promise<{ciphertext: string, iv: string, salt: string|null, keyFragment: string, passwordHash: string|null}>}
   */
  async encrypt(plaintext, password = null) {
    // 生成随机密钥 (32 bytes = 256 bits)
    const masterKey = this.getRandomBytes(32);

    // 生成随机 IV (12 bytes for GCM)
    const iv = this.getRandomBytes(12);

    let encryptKey = masterKey;
    let salt = null;
    let passwordHash = null;

    // 如果有密码保护
    if (password) {
      salt = this.getRandomBytes(16);
      const derivedKey = await this.deriveKey(password, salt);
      encryptKey = this.xorBytes(masterKey, derivedKey);
      passwordHash = await this.hashPassword(password);
    }

    // 导入密钥
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encryptKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // 加密
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      plaintextBytes
    );

    return {
      ciphertext: this.toBase64(ciphertextBuffer),
      iv: this.toBase64(iv),
      salt: salt ? this.toBase64(salt) : null,
      keyFragment: this.toBase64URL(masterKey),
      passwordHash
    };
  },

  /**
   * 解密内容
   * @param {string} ciphertext - Base64 密文
   * @param {string} iv - Base64 IV
   * @param {string} keyFragment - URL密钥片段
   * @param {string|null} salt - Base64 盐
   * @param {string|null} password - 用户密码
   * @returns {Promise<string>} 明文
   */
  async decrypt(ciphertext, iv, keyFragment, salt = null, password = null) {
    const masterKey = this.fromBase64URL(keyFragment);
    const ivBytes = this.fromBase64(iv);
    const ciphertextBytes = this.fromBase64(ciphertext);

    let decryptKey = masterKey;

    // 如果有密码保护
    if (salt && password) {
      const saltBytes = this.fromBase64(salt);
      const derivedKey = await this.deriveKey(password, saltBytes);
      decryptKey = this.xorBytes(masterKey, derivedKey);
    }

    // 导入密钥
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      decryptKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // 解密
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      cryptoKey,
      ciphertextBytes
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintextBuffer);
  },

  /**
   * 使用 PBKDF2 派生密钥
   */
  async deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      256
    );

    return new Uint8Array(derivedBits);
  },

  /**
   * XOR 两个字节数组
   */
  xorBytes(a, b) {
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  },

  /**
   * 计算密码哈希 (用于服务端验证)
   */
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return this.toBase64(hashBuffer);
  },

  /**
   * 文件转 ArrayBuffer
   * @param {File} file - 文件对象
   * @returns {Promise<ArrayBuffer>}
   */
  async fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * 统一加密接口，支持文本、图片或混合内容
   * 数据格式: [元数据长度 4字节][元数据 JSON][原始内容]
   * @param {Object} params - 加密参数
   * @param {string|null} params.text - 文本内容
   * @param {File|null} params.file - 图片文件
   * @param {string|null} params.password - 可选密码
   * @returns {Promise<{ciphertext: string, iv: string, salt: string|null, keyFragment: string, passwordHash: string|null, contentType: string}>}
   */
  async encryptContent({ text = null, file = null, password = null }) {
    const hasText = text && text.trim().length > 0;
    const hasFile = file instanceof File;

    if (!hasText && !hasFile) {
      throw new Error('请输入文本或上传图片');
    }

    let dataBytes;
    let metadata = {};
    let contentType;

    // 验证图片
    if (hasFile) {
      if (!this.SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        throw new Error('不支持的图片格式');
      }
      if (file.size > this.MAX_FILE_SIZE) {
        throw new Error('文件大小超过 2MB 限制');
      }
    }

    if (hasText && hasFile) {
      // 混合内容: 文本存入元数据，图片作为二进制内容
      contentType = 'mixed';
      metadata = {
        type: 'mixed',
        text: text.trim(),
        fileName: file.name,
        mimeType: file.type
      };
      const arrayBuffer = await this.fileToArrayBuffer(file);
      dataBytes = new Uint8Array(arrayBuffer);
    } else if (hasText) {
      // 仅文本
      contentType = 'text';
      metadata = { type: 'text' };
      const encoder = new TextEncoder();
      dataBytes = encoder.encode(text.trim());
    } else {
      // 仅图片
      contentType = 'image';
      metadata = {
        type: 'image',
        fileName: file.name,
        mimeType: file.type
      };
      const arrayBuffer = await this.fileToArrayBuffer(file);
      dataBytes = new Uint8Array(arrayBuffer);
    }

    // 序列化元数据
    const metadataJson = JSON.stringify(metadata);
    const metadataBytes = new TextEncoder().encode(metadataJson);

    // 组装数据: [元数据长度 4字节][元数据][内容]
    const metadataLength = metadataBytes.length;
    const totalLength = 4 + metadataLength + dataBytes.length;
    const combinedData = new Uint8Array(totalLength);

    // 写入元数据长度 (4字节, big-endian)
    combinedData[0] = (metadataLength >> 24) & 0xff;
    combinedData[1] = (metadataLength >> 16) & 0xff;
    combinedData[2] = (metadataLength >> 8) & 0xff;
    combinedData[3] = metadataLength & 0xff;

    // 写入元数据
    combinedData.set(metadataBytes, 4);

    // 写入内容
    combinedData.set(dataBytes, 4 + metadataLength);

    // 生成随机密钥 (32 bytes = 256 bits)
    const masterKey = this.getRandomBytes(32);

    // 生成随机 IV (12 bytes for GCM)
    const iv = this.getRandomBytes(12);

    let encryptKey = masterKey;
    let salt = null;
    let passwordHash = null;

    // 如果有密码保护
    if (password) {
      salt = this.getRandomBytes(16);
      const derivedKey = await this.deriveKey(password, salt);
      encryptKey = this.xorBytes(masterKey, derivedKey);
      passwordHash = await this.hashPassword(password);
    }

    // 导入密钥
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encryptKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // 加密
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      combinedData
    );

    return {
      ciphertext: this.toBase64(ciphertextBuffer),
      iv: this.toBase64(iv),
      salt: salt ? this.toBase64(salt) : null,
      keyFragment: this.toBase64URL(masterKey),
      passwordHash,
      contentType
    };
  },

  /**
   * 统一解密接口
   * @param {string} ciphertext - Base64 密文
   * @param {string} iv - Base64 IV
   * @param {string} keyFragment - URL密钥片段
   * @param {string|null} salt - Base64 盐
   * @param {string|null} password - 用户密码
   * @returns {Promise<{content: ArrayBuffer|string, metadata: {type: string, fileName?: string, mimeType?: string}}>}
   */
  async decryptContent(ciphertext, iv, keyFragment, salt = null, password = null) {
    const masterKey = this.fromBase64URL(keyFragment);
    const ivBytes = this.fromBase64(iv);
    const ciphertextBytes = this.fromBase64(ciphertext);

    let decryptKey = masterKey;

    // 如果有密码保护
    if (salt && password) {
      const saltBytes = this.fromBase64(salt);
      const derivedKey = await this.deriveKey(password, saltBytes);
      decryptKey = this.xorBytes(masterKey, derivedKey);
    }

    // 导入密钥
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      decryptKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // 解密
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      cryptoKey,
      ciphertextBytes
    );

    const decryptedBytes = new Uint8Array(decryptedBuffer);

    // 解析元数据长度
    const metadataLength = (decryptedBytes[0] << 24) |
                          (decryptedBytes[1] << 16) |
                          (decryptedBytes[2] << 8) |
                          decryptedBytes[3];

    // 解析元数据
    const metadataBytes = decryptedBytes.slice(4, 4 + metadataLength);
    const metadataJson = new TextDecoder().decode(metadataBytes);
    const metadata = JSON.parse(metadataJson);

    // 解析内容
    const contentBytes = decryptedBytes.slice(4 + metadataLength);

    if (metadata.type === 'text') {
      // 文本内容，转换为字符串
      const content = new TextDecoder().decode(contentBytes);
      return { content, metadata };
    } else if (metadata.type === 'mixed') {
      // 混合内容: 文本在 metadata.text，图片在 contentBytes
      return {
        content: contentBytes.buffer,
        text: metadata.text,
        metadata
      };
    } else {
      // 二进制内容（图片），返回 ArrayBuffer
      return { content: contentBytes.buffer, metadata };
    }
  }
};

// 导出供全局使用
window.CryptoUtils = CryptoUtils;
