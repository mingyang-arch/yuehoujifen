/**
 * 客户端加密模块 - AES-256-GCM
 */
const CryptoUtils = {
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
  }
};

// 导出供全局使用
window.CryptoUtils = CryptoUtils;
