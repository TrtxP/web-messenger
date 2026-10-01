import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { CryptoService } from '../../crypto/crypto.service';

export class ChatPollsStore {
  constructor(
    private readonly pool: Pool,
    private readonly crypto: CryptoService,
  ) {}

  async createPoll(chatId: string, creatorId: string, question: string, options: string[], isAnonymous = false) {
    const member = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, creatorId],
    );
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    if (!question || !question.trim()) throw new HttpException('Question is required', HttpStatus.BAD_REQUEST);
    const cleanOptions = [...new Set((options || []).map((o) => (o || '').trim()).filter((o) => o.length > 0))];
    if (cleanOptions.length < 2) throw new HttpException('At least 2 options required', HttpStatus.BAD_REQUEST);
    const pollId = randomUUID();
    await this.pool.query(
      `INSERT INTO polls (id, chat_id, creator_id, question_encrypted, is_anonymous, is_closed) VALUES ($1, $2, $3, $4, $5, FALSE)`,
      [pollId, chatId, creatorId, this.crypto.encryptText(question.trim()), isAnonymous],
    );
    const createdOptions: any[] = [];
    for (let i = 0; i < cleanOptions.length; i++) {
      const optId = randomUUID();
      await this.pool.query(
        `INSERT INTO poll_options (id, poll_id, text_encrypted, sort_order) VALUES ($1, $2, $3, $4)`,
        [optId, pollId, this.crypto.encryptText(cleanOptions[i]), i],
      );
      createdOptions.push({ id: optId, text: cleanOptions[i] });
    }
    const msgId = randomUUID();
    const createdAt = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO messages (id, chat_id, sender_id, type, text, content_encrypted, media_id, status, is_edited, created_at) VALUES ($1, $2, $3, 'POLL', '', $4, NULL, 'sent', FALSE, $5)`,
      [msgId, chatId, creatorId, this.crypto.encryptText(pollId), createdAt],
    );
    return {
      id: pollId,
      chatId,
      question: question.trim(),
      options: createdOptions,
      isAnonymous,
      isClosed: false,
      messageId: msgId,
    };
  }

  async getPoll(pollId: string, userId: string) {
    const pollRes = await this.pool.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!pollRes.rowCount) throw new HttpException('Poll not found', HttpStatus.NOT_FOUND);
    const poll = pollRes.rows[0];
    const member = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [poll.chat_id, userId],
    );
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    const optsRes = await this.pool.query(
      `SELECT id, text_encrypted, sort_order FROM poll_options WHERE poll_id = $1 ORDER BY sort_order`,
      [pollId],
    );
    const votesRes = await this.pool.query(
      `SELECT pv.option_id AS "optionId", pv.user_id AS "userId", u.username FROM poll_votes pv JOIN users u ON u.id = pv.user_id WHERE pv.poll_id = $1`,
      [pollId],
    );
    const counts: Record<string, number> = {};
    for (const o of optsRes.rows) counts[o.id] = 0;
    for (const v of votesRes.rows) counts[v.optionId] = (counts[v.optionId] || 0) + 1;
    const total = votesRes.rows.length;
    const myVote = votesRes.rows.find((v: any) => v.userId === userId);
    return {
      id: poll.id,
      chatId: poll.chat_id,
      creatorId: poll.creator_id,
      question: this.crypto.decryptText(poll.question_encrypted),
      isAnonymous: poll.is_anonymous,
      isClosed: poll.is_closed,
      totalVotes: total,
      myOptionId: myVote ? myVote.optionId : null,
      options: optsRes.rows.map((o: any) => ({
        id: o.id,
        text: this.crypto.decryptText(o.text_encrypted),
        votes: counts[o.id] || 0,
        percent: total === 0 ? 0 : Math.round(((counts[o.id] || 0) / total) * 100),
        voters: poll.is_anonymous
          ? []
          : votesRes.rows
              .filter((v: any) => v.optionId === o.id)
              .map((v: any) => ({ userId: v.userId, username: v.username })),
      })),
    };
  }

  async votePoll(pollId: string, userId: string, optionId: string) {
    const pollRes = await this.pool.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!pollRes.rowCount) throw new HttpException('Poll not found', HttpStatus.NOT_FOUND);
    const poll = pollRes.rows[0];
    if (poll.is_closed) throw new HttpException('Poll is closed', HttpStatus.BAD_REQUEST);
    const member = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [poll.chat_id, userId],
    );
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    const optCheck = await this.pool.query(
      `SELECT 1 FROM poll_options WHERE id = $1 AND poll_id = $2`,
      [optionId, pollId],
    );
    if (!optCheck.rowCount) throw new HttpException('Option not found', HttpStatus.NOT_FOUND);
    await this.pool.query(
      `INSERT INTO poll_votes (id, poll_id, option_id, user_id) VALUES ($1, $2, $3, $4) ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = $3`,
      [randomUUID(), pollId, optionId, userId],
    );
    return this.getPoll(pollId, userId);
  }

  async retractPollVote(pollId: string, userId: string) {
    await this.pool.query(`DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2`, [pollId, userId]);
    return this.getPoll(pollId, userId);
  }

  async closePoll(pollId: string, userId: string) {
    const pollRes = await this.pool.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!pollRes.rowCount) throw new HttpException('Poll not found', HttpStatus.NOT_FOUND);
    if (pollRes.rows[0].creator_id !== userId) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    await this.pool.query(`UPDATE polls SET is_closed = TRUE WHERE id = $1`, [pollId]);
    return this.getPoll(pollId, userId);
  }
}
