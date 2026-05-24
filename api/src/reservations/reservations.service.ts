import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import type { Reservation } from '../common/metrics';
import { RESERVATIONS } from '../seed/seed-data';

@Injectable()
export class ReservationsService {
  constructor(private readonly firebase: FirebaseService) {}

  async findAll(): Promise<Reservation[]> {
    const fromDb = await this.firebase.listCollection<Reservation>('reservations');
    if (fromDb) return fromDb;
    return RESERVATIONS.map((r) => ({
      ...r,
      propertyId: r.propertyId as Reservation['propertyId'],
    }));
  }
}
