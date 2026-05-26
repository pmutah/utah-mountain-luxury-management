import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

type StorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

const RECEIPT_SIGNED_URL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class FirebaseService implements OnModuleInit {
  private db: Firestore | null = null;
  private bucket: StorageBucket | null = null;
  private memorySettings: Record<string, unknown> = {};

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
    const credPath = this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS')?.trim();
    if (!raw && !credPath) {
      console.warn('[firebase] No credentials configured — using in-memory seed data');
      return;
    }
    try {
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID') ?? 'wilhite-portfolio';
      this.db = this.initFirestore(projectId);
      this.bucket = this.initStorage(projectId);
    } catch (err) {
      console.warn('[firebase] Init failed — using in-memory seed data', err);
    }
  }

  get enabled(): boolean {
    return this.db !== null;
  }

  get storageEnabled(): boolean {
    return this.bucket !== null;
  }

  private initFirestore(projectId: string): Firestore {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();

    if (getApps().length === 0) {
      if (raw) {
        const cred = JSON.parse(raw) as Record<string, unknown>;
        initializeApp({
          credential: cert(cred as Parameters<typeof cert>[0]),
          projectId,
        });
      } else {
        initializeApp({
          credential: applicationDefault(),
          projectId,
        });
      }
    }

    return getFirestore();
  }

  private initStorage(projectId: string): StorageBucket | null {
    if (getApps().length === 0) return null;
    const bucketName =
      this.config.get<string>('FIREBASE_STORAGE_BUCKET')?.trim() ||
      `${projectId}.appspot.com`;
    try {
      return getStorage().bucket(bucketName);
    } catch (err) {
      console.warn('[firebase] Storage init failed — receipt uploads disabled', err);
      return null;
    }
  }

  async uploadReceipt(storagePath: string, buffer: Buffer, contentType: string): Promise<void> {
    if (!this.bucket) {
      throw new Error('Firebase Storage not configured');
    }
    await this.bucket.file(storagePath).save(buffer, {
      metadata: { contentType },
      resumable: false,
    });
  }

  async deleteReceipt(storagePath: string): Promise<void> {
    if (!this.bucket) return;
    try {
      await this.bucket.file(storagePath).delete({ ignoreNotFound: true });
    } catch {
      // ignore missing objects
    }
  }

  async getSignedReadUrl(storagePath: string): Promise<string> {
    if (!this.bucket) {
      throw new Error('Firebase Storage not configured');
    }
    const [url] = await this.bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + RECEIPT_SIGNED_URL_MS,
    });
    return url;
  }

  collection(name: string) {
    if (!this.db) {
      throw new Error('Firestore not configured');
    }
    return this.db.collection(name);
  }

  async getSetting<T>(docId: string, fallback: T): Promise<T> {
    if (!this.enabled) {
      return (this.memorySettings[docId] as T) ?? fallback;
    }
    try {
      const doc = await this.collection('settings').doc(docId).get();
      if (!doc.exists) return fallback;
      return doc.data() as T;
    } catch {
      return fallback;
    }
  }

  async setSetting(docId: string, value: unknown): Promise<void> {
    if (!this.enabled) {
      this.memorySettings[docId] = value;
      return;
    }
    await this.collection('settings').doc(docId).set(value as FirebaseFirestore.DocumentData);
  }

  async listCollection<T>(name: string): Promise<T[] | null> {
    if (!this.enabled) return null;
    try {
      const snap = await this.collection(name).get();
      if (snap.empty) return null;
      return snap.docs.map((d) => d.data() as T);
    } catch {
      return null;
    }
  }

  createBatch() {
    if (!this.db) throw new Error('Firestore not configured');
    return this.db.batch();
  }
}
