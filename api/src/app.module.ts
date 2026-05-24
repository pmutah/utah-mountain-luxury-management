import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { FirebaseModule } from './firebase/firebase.module';
import { PropertiesModule } from './properties/properties.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ExpensesModule } from './expenses/expenses.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { SeedModule } from './seed/seed.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '..', '.env'), join(__dirname, '..', '..', '..', '.env')],
    }),
    FirebaseModule,
    PropertiesModule,
    ReservationsModule,
    ExpensesModule,
    PortfolioModule,
    SeedModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
