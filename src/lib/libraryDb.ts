/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalBookRecord, BookProgress } from '../types';

export class LibraryDb {
  private dbName = 'EpubReaderLibrary';
  private dbVersion = 2;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const database = request.result;
        
        // Upgrade Store: Books standard cache store
        if (!database.objectStoreNames.contains('books')) {
          database.createObjectStore('books', { keyPath: 'id' });
        }
        
        // Upgrade Store: User-specific chapter reading placement tracking session
        if (!database.objectStoreNames.contains('progress')) {
          database.createObjectStore('progress', { keyPath: 'bookId' });
        }
      };
    });
  }

  async saveBook(id: string, name: string, arrayBuffer: ArrayBuffer): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not initialized'));
      }
      const transaction = this.db.transaction('books', 'readwrite');
      const store = transaction.objectStore('books');
      
      const record: LocalBookRecord = {
        id,
        name,
        data: arrayBuffer,
        addedAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getBook(id: string): Promise<ArrayBuffer | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not initialized'));
      }
      const transaction = this.db.transaction('books', 'readonly');
      const store = transaction.objectStore('books');
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result?.data || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBook(id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not initialized'));
      }
      const transaction = this.db.transaction(['books', 'progress'], 'readwrite');
      const booksStore = transaction.objectStore('books');
      const progressStore = transaction.objectStore('progress');

      booksStore.delete(id);
      progressStore.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async listBooks(): Promise<{ id: string; name: string; addedAt: number }[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not initialized'));
      }
      const transaction = this.db.transaction('books', 'readonly');
      const store = transaction.objectStore('books');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result || []) as LocalBookRecord[];
        const sorted = results.map((b) => ({
          id: b.id,
          name: b.name,
          addedAt: b.addedAt
        })).sort((a, b) => b.addedAt - a.addedAt);
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- Reading Progression Store Management APIs ---

  async saveProgress(progress: BookProgress): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not initialized'));
      }
      const transaction = this.db.transaction('progress', 'readwrite');
      const store = transaction.objectStore('progress');
      const request = store.put(progress);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProgress(bookId: string): Promise<BookProgress | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not initialized'));
      }
      const transaction = this.db.transaction('progress', 'readonly');
      const store = transaction.objectStore('progress');
      const request = store.get(bookId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
