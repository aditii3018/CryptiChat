import { Cryptography } from './crypto';

interface SteganographyData {
  encryptedMessage: string;
  shiftKeys: number[];
  vigenereKey: string;
}

export class Steganography {
  private static readonly IMAGE_POOL = [
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05',
    'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e',
    'https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f',
    'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1',
  ];

  static getRandomImage(): string {
    const randomIndex = Math.floor(Math.random() * this.IMAGE_POOL.length);
    return this.IMAGE_POOL[randomIndex];
  }

  static async hideMessage(message: string): Promise<{ imageUrl: string; data: SteganographyData }> {
    const encrypted = Cryptography.encrypt(message);
    const imageUrl = this.getRandomImage();

    return {
      imageUrl,
      data: {
        encryptedMessage: encrypted.cipherText,
        shiftKeys: encrypted.shiftKeys,
        vigenereKey: encrypted.vigenereKey,
      },
    };
  }

  static revealMessage(data: SteganographyData): string {
    return Cryptography.decrypt(
      data.encryptedMessage,
      data.shiftKeys,
      data.vigenereKey
    );
  }
}