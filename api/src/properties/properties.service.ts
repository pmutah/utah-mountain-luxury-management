import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PROPERTIES } from '../common/constants';

@Injectable()
export class PropertiesService {
  constructor(private readonly firebase: FirebaseService) {}

  list() {
    return Object.values(PROPERTIES);
  }

  async listFromDb() {
    const snap = await this.firebase.collection('properties').get();
    if (snap.empty) return this.list();
    return snap.docs.map((d) => d.data());
  }
}
