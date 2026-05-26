import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Redirect,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { RECEIPT_MAX_BYTES } from './expenses.constants';
import type { ReceiptUploadFile } from './expenses.types';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  findAll() {
    return this.expensesService.findAll();
  }

  @Get(':id/receipt')
  @Redirect()
  async getReceipt(@Param('id') id: string) {
    const url = await this.expensesService.getReceiptRedirectUrl(id);
    return { url, statusCode: 302 };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: RECEIPT_MAX_BYTES },
    }),
  )
  create(@Body() dto: CreateExpenseDto, @UploadedFile() file?: ReceiptUploadFile) {
    return this.expensesService.create(dto, file);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: RECEIPT_MAX_BYTES },
    }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @UploadedFile() file?: ReceiptUploadFile,
  ) {
    return this.expensesService.update(id, dto, file);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.expensesService.remove(id);
  }
}
