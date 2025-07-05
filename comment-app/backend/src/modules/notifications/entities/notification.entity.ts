import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Comment } from '../../comments/entities/comment.entity';

export enum NotificationType {
  COMMENT_REPLY = 'comment_reply',
  MENTION = 'mention',
  SYSTEM = 'system',
}

@Entity('notifications')
@Index(['userId'])
@Index(['isRead'])
@Index(['createdAt'])
@Index(['type'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.COMMENT_REPLY,
  })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt?: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Foreign Keys
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  commentId?: string;

  @Column({ type: 'uuid', nullable: true })
  triggeredById?: string;

  // Relationships
  @ManyToOne(() => User, (user) => user.notifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Comment, (comment) => comment.notifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'commentId' })
  comment?: Comment;

  @ManyToOne(() => User, (user) => user.triggeredNotifications, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'triggeredById' })
  triggeredBy?: User;

  // Helper methods
  markAsRead(): void {
    this.isRead = true;
    this.readAt = new Date();
  }

  markAsUnread(): void {
    this.isRead = false;
    this.readAt = null;
  }
}