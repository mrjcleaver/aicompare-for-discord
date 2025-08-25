import crypto from 'crypto';

export class EncryptionService {
  private static instance: EncryptionService;
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly saltLength = 32; // 256 bits
  
  private masterKey: Buffer;

  private constructor() {
    const keyString = process.env.ENCRYPTION_KEY;
    if (!keyString || keyString.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
    
    // Use the first 32 bytes of the key for consistency
    this.masterKey = Buffer.from(keyString.slice(0, 32), 'utf8');
  }

  public static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  /**
   * Encrypt a string using AES-256-GCM with a random salt
   */
  public async encrypt(plaintext: string, userSalt?: string): Promise<string> {
    try {
      // Generate random salt for this encryption
      const salt = userSalt ? 
        Buffer.from(userSalt.slice(0, this.saltLength).padEnd(this.saltLength, '0')) :
        crypto.randomBytes(this.saltLength);

      // Derive key from master key and salt using PBKDF2
      const derivedKey = crypto.pbkdf2Sync(this.masterKey, salt, 100000, this.keyLength, 'sha256');

      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, derivedKey);
      cipher.setAAD(salt); // Additional authenticated data

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine salt, iv, tag, and encrypted data
      const result = Buffer.concat([
        salt,
        iv,
        tag,
        encrypted
      ]);

      return result.toString('base64');
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt a string encrypted with the encrypt method
   */
  public async decrypt(encryptedData: string): Promise<string> {
    try {
      const data = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = data.slice(0, this.saltLength);
      const iv = data.slice(this.saltLength, this.saltLength + this.ivLength);
      const tag = data.slice(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength
      );
      const encrypted = data.slice(this.saltLength + this.ivLength + this.tagLength);

      // Derive the same key using the extracted salt
      const derivedKey = crypto.pbkdf2Sync(this.masterKey, salt, 100000, this.keyLength, 'sha256');

      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, derivedKey);
      decipher.setAAD(salt);
      decipher.setAuthTag(tag);

      // Decrypt
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Generate a hash of the plaintext for verification without decryption
   */
  public hash(plaintext: string): string {
    return crypto
      .createHmac('sha256', this.masterKey)
      .update(plaintext)
      .digest('hex');
  }

  /**
   * Verify if a plaintext matches the given hash
   */
  public verifyHash(plaintext: string, hash: string): boolean {
    const computedHash = this.hash(plaintext);
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(hash, 'hex')
    );
  }

  /**
   * Generate a random encryption key for use as ENCRYPTION_KEY
   */
  public static generateKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
  }

  /**
   * Encrypt data with a user-specific key derivation
   */
  public async encryptForUser(plaintext: string, userId: string): Promise<string> {
    // Use user ID as part of salt for user-specific encryption
    const userSalt = crypto
      .createHash('sha256')
      .update(userId + this.masterKey.toString('hex'))
      .digest('hex')
      .slice(0, this.saltLength);

    return this.encrypt(plaintext, userSalt);
  }

  /**
   * Test the encryption/decryption functionality
   */
  public async test(): Promise<boolean> {
    try {
      const testData = 'test-api-key-12345';
      const encrypted = await this.encrypt(testData);
      const decrypted = await this.decrypt(encrypted);
      
      const success = testData === decrypted;
      if (success) {
        console.log('✅ Encryption service test passed');
      } else {
        console.error('❌ Encryption service test failed');
      }
      
      return success;
    } catch (error) {
      console.error('❌ Encryption service test failed:', error);
      return false;
    }
  }

  /**
   * Securely wipe sensitive data from memory
   */
  public static wipeSensitiveData(buffer: Buffer): void {
    if (buffer && buffer.length > 0) {
      buffer.fill(0);
    }
  }

  /**
   * Create a secure random string for tokens, IDs, etc.
   */
  public static generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}