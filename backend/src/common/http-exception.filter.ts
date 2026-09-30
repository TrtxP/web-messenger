import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof PayloadTooLargeException) {
      status = HttpStatus.BAD_REQUEST;
      message = 'File size exceeds limit';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message || exception.message;
    } else if (exception?.message?.includes('File too large')) {
      status = HttpStatus.BAD_REQUEST;
      message = 'File size exceeds limit';
    }

    response.status(status).json({
      statusCode: status,
      message,
    });
  }
}

