import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PROPERTIES } from '../common/constants';
import { DEFAULT_EXTRA_CLEANING, EXPENSES, RESERVATIONS } from './seed-data';

@Injectable()
export class SeedService {
  constructor(private readonly firebase: FirebaseService) {}

  async seed() {
    if (!this.firebase.enabled) {
      return {
        mode: 'memory',
        properties: Object.keys(PROPERTIES).length,
        message: 'Firestore not configured — API serves embedded seed data',
      };
    }

    const batch = this.firebase.createBatch();

    Object.values(PROPERTIES).forEach((p) => {
      batch.set(this.firebase.collection('properties').doc(p.id), p);
    });

    RESERVATIONS.forEach((r) => {
      batch.set(this.firebase.collection('reservations').doc(r.id), r);
    });
    EXPENSES.forEach((e) => {
      batch.set(this.firebase.collection('expenses').doc(e.id), e);
    });
    batch.set(
      this.firebase.collection('settings').doc('extraCleaningFees'),
      DEFAULT_EXTRA_CLEANING,
    );

    await batch.commit();
    return {
      mode: 'firestore',
      properties: Object.keys(PROPERTIES).length,
      reservations: RESERVATIONS.length,
      expenses: EXPENSES.length,
    };
  }
}
