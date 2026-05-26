import { IsIn, IsNumber, IsString, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
  @IsIn(['ranch', 'lindon'])
  propertyId!: 'ranch' | 'lindon';

  @Matches(/^\d{4}-\d{2}$/)
  month!: string;

  @IsString()
  category!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;
}
