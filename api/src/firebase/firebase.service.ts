import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private db: Firestore | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.db = this.initFirestore();
  }

  private initFirestore(): Firestore {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID') ?? 'wilhite-portfolio';
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

  get firestore(): Firestore {
    if (!this.db) {
      this.db = this.initFirestore();
    }
    return this.db;
  }

  collection(name: string) {
    return this.firestore.collection(name);
  }
}
