/** Shape of an uploaded receipt from multer (memory storage). */
export interface ReceiptUploadFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}
