import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Notification } from '../../notifications/entities/notification.entity';

@Entity('comments')
@Index(['authorId'])
@Index(['parentId'])
@Index(['createdAt'])
@Index(['isEdited'])
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  originalContent?: string;

  @Column({ type: 'boolean', default: false })
  isEdited: boolean;

  @Column({ type: 'timestamp', nullable: true })
  editedAt?: Date;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  restoredAt?: Date;

  @Column({ type: 'int', default: 0 })
  depth: number;

  @Column({ type: 'int', default: 0 })
  childrenCount: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  path?: string; // Materialized path for efficient querying

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAtSoft?: Date;

  // Foreign Keys
  @Column({ type: 'uuid' })
  authorId: string;

  @Column({ type: 'uuid', nullable: true })
  parentId?: string;

  // Relationships
  @ManyToOne(() => User, (user) => user.comments, { 
    eager: true,
    onDelete: 'CASCADE' 
  })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @ManyToOne(() => Comment, (comment) => comment.children, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'parentId' })
  parent?: Comment;

  @OneToMany(() => Comment, (comment) => comment.parent)
  children: Comment[];

  @OneToMany(() => Notification, (notification) => notification.comment)
  notifications: Notification[];

  // Helper methods
  get isEditable(): boolean {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    return this.createdAt > fifteenMinutesAgo && !this.isDeleted;
  }

  get isDeletable(): boolean {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    return this.createdAt > fifteenMinutesAgo;
  }

  get isRestorable(): boolean {
    if (!this.isDeleted || !this.deletedAt) return false;
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    return this.deletedAt > fifteenMinutesAgo;
  }

  get displayContent(): string {
    return this.isDeleted ? '[Comment deleted]' : this.content;
  }
}