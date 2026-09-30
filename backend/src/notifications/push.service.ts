import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import * as admin from 'firebase-admin';
import { applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private firebaseApp: admin.App | null = null;

  constructor(private readonly pool: Pool) {}

  onModuleInit() {
    this.initFirebase();
  }

  private initFirebase() {
    const apps = getApps();
    if (apps.length > 0) {
      this.firebaseApp = apps[0];
      this.logger.log('Reusing existing Firebase Admin application.');
      return;
    }

    const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    try {
      if (saEnv) {
        let certObj: any;
        if (saEnv.trim().startsWith('{')) {
          certObj = JSON.parse(saEnv);
        } else {
          const filePath = fs.existsSync(saEnv) ? saEnv : path.resolve(process.cwd(), saEnv);
          if (fs.existsSync(filePath)) {
            certObj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          }
        }
        if (certObj) {
          this.firebaseApp = admin.initializeApp({
            credential: cert(certObj),
          });
          this.logger.log('Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT.');
          return;
        }
      }

      if (saPath && fs.existsSync(saPath)) {
        this.firebaseApp = admin.initializeApp({
          credential: applicationDefault(),
        });
        this.logger.log('Firebase Admin initialized with GOOGLE_APPLICATION_CREDENTIALS.');
        return;
      }

      this.logger.warn(
        'No Firebase service account found (FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS). ' +
          'Push notifications will run in logged mock mode until credentials are provided.',
      );
    } catch (e: any) {
      this.logger.error(`Failed to initialize Firebase Admin: ${e.message}`);
    }
  }

  async sendPushToUser(
    userId: string,
    notification: { title: string; body: string },
    data: Record<string, string> = {},
  ): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT fcm_token FROM users WHERE id = $1', [userId]);
      const token = res.rows[0]?.fcm_token;

      if (!token || token.trim().length === 0) {
        return false;
      }

      if (!this.firebaseApp) {
        this.logger.log(
          `[PushService Mock] to=${userId} token=${String(token).slice(0, 12)}... title="${notification.title}" body="${notification.body}" data=${JSON.stringify(data)}`,
        );
        return true;
      }

      const cleanData: Record<string, string> = {};
      for (const [k, v] of Object.entries(data || {})) {
        cleanData[k] = v !== undefined && v !== null ? String(v) : '';
      }

      const cleanNotification = {
        title: String(notification?.title || 'Mobile Messenger'),
        body: String(notification?.body || ''),
      };

      await getMessaging(this.firebaseApp).send({
        token,
        notification: cleanNotification,
        data: cleanData,
        android: {
          priority: 'high',
          notification: {
            channelId:
              cleanData.type === 'invitation_received'
                ? 'chat_invitations'
                : cleanData.type === 'invitation_accepted' ||
                  cleanData.type === 'invitation_declined'
                ? 'chat_system'
                : 'chat_messages',
            priority: 'high',
            defaultSound: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });

      this.logger.log(`[PushService] Successfully sent push notification to user ${userId}`);
      return true;
    } catch (err: any) {
      if (
        err.code === 'messaging/invalid-registration-token' ||
        err.code === 'messaging/registration-token-not-registered'
      ) {
        await this.pool.query('UPDATE users SET fcm_token = NULL WHERE id = $1', [userId]);
      }
      this.logger.error(`Failed to send push notification to user ${userId}: ${err.message}`);
      return false;
    }
  }

  async sendInvitationPush(toUserId: string, invitationId: string, senderName?: string, senderId?: string) {
    const safeSenderName = senderName || 'Someone';
    const safeInvitationId = invitationId || '';
    const safeSenderId = senderId || '';
    if (toUserId && safeSenderId && toUserId === safeSenderId) {
      return false;
    }
    return this.sendPushToUser(
      toUserId,
      {
        title: 'Chat Invitation',
        body: `User ${safeSenderName} sent you a chat invitation`,
      },
      {
        type: 'invitation_received',
        title: 'Chat Invitation',
        invitationId: safeInvitationId,
        senderName: safeSenderName,
        senderId: safeSenderId,
        body: `User ${safeSenderName} sent you a chat invitation`,
      },
    );
  }

  async sendInvitationAcceptedPush(toUserId: string, invitationId: string, responderName?: string, responderId?: string, chatId?: string) {
    const safeResponderName = responderName || 'Someone';
    const safeInvitationId = invitationId || '';
    const safeChatId = chatId || '';
    const safeResponderId = responderId || '';
    if (toUserId && safeResponderId && toUserId === safeResponderId) {
      return false;
    }
    return this.sendPushToUser(
      toUserId,
      {
        title: 'Invitation accepted',
        body: `User ${safeResponderName} has accepted your invitation!`,
      },
      {
        type: 'invitation_accepted',
        title: 'Invitation accepted',
        body: `User ${safeResponderName} has accepted your invitation!`,
        invitationId: safeInvitationId,
        responderName: safeResponderName,
        senderId: safeResponderId,
        chatId: safeChatId,
      },
    );
  }

  async sendInvitationDeclinedPush(toUserId: string, invitationId: string, responderName?: string, responderId?: string, chatId?: string) {
    const safeResponderName = responderName || 'Someone';
    const safeInvitationId = invitationId || '';
    const safeChatId = chatId || '';
    const safeResponderId = responderId || '';
    if (toUserId && safeResponderId && toUserId === safeResponderId) {
      return false;
    }
    return this.sendPushToUser(
      toUserId,
      {
        title: 'Invitation rejected',
        body: `User ${safeResponderName} has declined your invitation.`,
      },
      {
        type: 'invitation_declined',
        title: 'Invitation declined',
        body: `User ${safeResponderName} has declined your invitation.`,
        invitationId: safeInvitationId,
        responderName: safeResponderName,
        senderId: safeResponderId,
        chatId: safeChatId
      },
    );
  }

  async sendMessagePush(toUserId: string, chatId: string, senderName: string, content: string, messageType: string, senderId?: string) {
    const safeSenderName = senderName || 'Someone';
    const safeContent = content || 'New message';
    const safeChatId = chatId || '';
    const safeType = messageType || 'TEXT';
    const safeSenderId = senderId || '';
    if (toUserId && safeSenderId && toUserId === safeSenderId) {
      return false;
    }
    return this.sendPushToUser(
      toUserId,
      {
        title: safeSenderName,
        body: safeContent,
      },
      {
        type: 'chat_message',
        title: safeSenderName,
        chatId: safeChatId,
        messageType: safeType,
        senderName: safeSenderName,
        body: safeContent,
        senderId: safeSenderId
      },
    );
  }
}
