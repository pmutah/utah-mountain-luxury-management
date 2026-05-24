import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import type { Reservation } from '../common/metrics';
import { RESERVATIONS } from '../seed/seed-data';

@Injectable()
export class ReservationsService {
  constructor(private readonly firebase: FirebaseService) {}

  async findAll(): Promise<Reservation[]> {
    const snap = await this.firebase.collection('reservations').get();
    if (snap.empty) {
      return RESERVATIONS.map((r) => ({ ...r, propertyId: r.propertyId as Reservation['propertyId'] }));
    }
    return snap.docs.map((d) => d.data() as Reservation);
  }
}
