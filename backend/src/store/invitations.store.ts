import { Pool } from 'pg';
import {
  InvitationQueriesStore,
  InvitationActionsStore,
} from './invitations';

export * from './invitations';

export class InvitationsStore {
  readonly queries: InvitationQueriesStore;
  readonly actions: InvitationActionsStore;

  constructor(private readonly pool: Pool) {
    this.queries = new InvitationQueriesStore(this.pool);
    this.actions = new InvitationActionsStore(this.pool);
  }

  async createInvitation(fromId: string, toId: string) {
    return this.actions.createInvitation(fromId, toId);
  }

  async getPendingInvitations(userId: string) {
    return this.queries.getPendingInvitations(userId);
  }

  async acceptInvitation(inviteId: string, currentUserId: string) {
    return this.actions.acceptInvitation(inviteId, currentUserId);
  }

  async declineInvitation(inviteId: string, currentUserId: string) {
    return this.actions.declineInvitation(inviteId, currentUserId);
  }

  async cancelInvitation(inviteId: string, currentUserId: string) {
    return this.actions.cancelInvitation(inviteId, currentUserId);
  }

  async invite(fromId: string, toId: string) {
    return this.actions.invite(fromId, toId);
  }
}
