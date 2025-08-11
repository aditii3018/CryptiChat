// Implementation of hybrid cryptography with TypeScript
export class Cryptography {
  private static generateShiftKey(plainText: string): number[] {
    return Array.from({ length: plainText.length }, () => Math.floor(Math.random() * 95));
  }

  private static generateVigenereKey(message: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    return Array.from({ length: message.length }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  private static shiftCipherEncrypt(message: string, shiftKeys: number[]): string {
    return message.split('').map((char, i) => {
      const code = char.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        return String.fromCharCode(((code - 32 + shiftKeys[i]) % 95) + 32);
      }
      return char;
    }).join('');
  }

  private static shiftCipherDecrypt(message: string, shiftKeys: number[]): string {
    return message.split('').map((char, i) => {
      const code = char.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        return String.fromCharCode(((code - 32 - shiftKeys[i] + 95) % 95) + 32);
      }
      return char;
    }).join('');
  }

  private static vigenereCipherEncrypt(message: string, key: string): string {
    return message.split('').map((char, i) => {
      const code = char.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        const shift = key[i % key.length].charCodeAt(0) - 32;
        return String.fromCharCode(((code - 32 + shift) % 95) + 32);
      }
      return char;
    }).join('');
  }

  private static vigenereCipherDecrypt(message: string, key: string): string {
    return message.split('').map((char, i) => {
      const code = char.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        const shift = key[i % key.length].charCodeAt(0) - 32;
        return String.fromCharCode(((code - 32 - shift + 95) % 95) + 32);
      }
      return char;
    }).join('');
  }

  static encrypt(message: string): { 
    cipherText: string; 
    shiftKeys: number[]; 
    vigenereKey: string; 
  } {
    const shiftKeys = this.generateShiftKey(message);
    const cipherText1 = this.shiftCipherEncrypt(message, shiftKeys);
    const vigenereKey = this.generateVigenereKey(cipherText1);
    const cipherText2 = this.vigenereCipherEncrypt(cipherText1, vigenereKey);

    return {
      cipherText: cipherText2,
      shiftKeys,
      vigenereKey
    };
  }

  static decrypt(
    cipherText: string, 
    shiftKeys: number[], 
    vigenereKey: string
  ): string {
    const decryptedText1 = this.vigenereCipherDecrypt(cipherText, vigenereKey);
    return this.shiftCipherDecrypt(decryptedText1, shiftKeys);
  }
}