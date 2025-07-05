import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

export interface CreateCommentData {
  content: string;
  authorId: string;
  parentId?: string;
}

export interface UpdateCommentData {
  content: string;
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(data: CreateCommentData): Promise<Comment> {
    const { content, authorId, parentId } = data;

    let depth = 0;
    let path = '';
    let parent: Comment | null = null;

    if (parentId) {
      parent = await this.findById(parentId);
      if (!parent) {
        throw new NotFoundException('Parent comment not found');
      }
      
      if (parent.isDeleted) {
        throw new BadRequestException('Cannot reply to deleted comment');
      }

      depth = parent.depth + 1;
      path = parent.path ? `${parent.path}.${parent.id}` : parent.id;

      // Update parent's children count
      await this.commentRepository.update(parentId, {
        childrenCount: parent.childrenCount + 1,
      });
    }

    const comment = this.commentRepository.create({
      content,
      authorId,
      parentId,
      depth,
      path,
    });

    const savedComment = await this.commentRepository.save(comment);

    // Create notification for parent comment author if this is a reply
    if (parent && parent.authorId !== authorId) {
      await this.notificationsService.createCommentReplyNotification(
        parent.authorId,
        savedComment.id,
        authorId,
      );
    }

    return this.findById(savedComment.id);
  }

  async findById(id: string): Promise<Comment | null> {
    return this.commentRepository.findOne({
      where: { id },
      relations: ['author', 'parent', 'children'],
    });
  }

  async findByIdWithChildren(id: string): Promise<Comment | null> {
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['author'],
    });

    if (!comment) return null;

    // Get nested children using path-based query for better performance
    const children = await this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .where('comment.path LIKE :path', { path: `${comment.path ? comment.path + '.' : ''}${comment.id}%` })
      .andWhere('comment.id != :id', { id })
      .orderBy('comment.createdAt', 'ASC')
      .getMany();

    comment.children = this.buildNestedStructure(children, comment.id);
    
    return comment;
  }

  async findMany(options: {
    page?: number;
    limit?: number;
    authorId?: string;
    parentId?: string;
    includeDeleted?: boolean;
  } = {}): Promise<{ comments: Comment[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, authorId, parentId, includeDeleted = false } = options;
    
    const queryBuilder = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.parent', 'parent');
    
    if (!includeDeleted) {
      queryBuilder.where('comment.isDeleted = false');
    }
    
    if (authorId) {
      queryBuilder.andWhere('comment.authorId = :authorId', { authorId });
    }
    
    if (parentId !== undefined) {
      if (parentId === null) {
        queryBuilder.andWhere('comment.parentId IS NULL');
      } else {
        queryBuilder.andWhere('comment.parentId = :parentId', { parentId });
      }
    }
    
    queryBuilder
      .orderBy('comment.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    
    const [comments, total] = await queryBuilder.getManyAndCount();
    
    return {
      comments,
      total,
      page,
      limit,
    };
  }

  async update(id: string, data: UpdateCommentData, userId: string): Promise<Comment> {
    const comment = await this.findById(id);
    
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }
    
    if (!comment.isEditable) {
      throw new ForbiddenException('Comment can only be edited within 15 minutes of posting');
    }
    
    if (comment.isDeleted) {
      throw new BadRequestException('Cannot edit deleted comment');
    }

    // Store original content for history
    if (!comment.isEdited) {
      comment.originalContent = comment.content;
    }

    comment.content = data.content;
    comment.isEdited = true;
    comment.editedAt = new Date();

    return this.commentRepository.save(comment);
  }

  async delete(id: string, userId: string): Promise<Comment> {
    const comment = await this.findById(id);
    
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    
    if (!comment.isDeletable) {
      throw new ForbiddenException('Comment can only be deleted within 15 minutes of posting');
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();

    return this.commentRepository.save(comment);
  }

  async restore(id: string, userId: string): Promise<Comment> {
    const comment = await this.findById(id);
    
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only restore your own comments');
    }
    
    if (!comment.isRestorable) {
      throw new ForbiddenException('Comment can only be restored within 15 minutes of deletion');
    }

    comment.isDeleted = false;
    comment.deletedAt = null;
    comment.restoredAt = new Date();

    return this.commentRepository.save(comment);
  }

  async getThreadByComment(commentId: string): Promise<Comment[]> {
    const comment = await this.findById(commentId);
    
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Find root comment
    let rootId = commentId;
    if (comment.path) {
      const pathParts = comment.path.split('.');
      rootId = pathParts[0];
    }

    // Get entire thread
    const thread = await this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .where('comment.id = :rootId OR comment.path LIKE :path', {
        rootId,
        path: `${rootId}%`,
      })
      .orderBy('comment.createdAt', 'ASC')
      .getMany();

    return thread;
  }

  private buildNestedStructure(comments: Comment[], parentId: string): Comment[] {
    const children = comments.filter(comment => 
      comment.path && comment.path.split('.').includes(parentId)
    );
    
    return children.map(child => {
      child.children = this.buildNestedStructure(comments, child.id);
      return child;
    });
  }

  async getCommentStats(): Promise<{
    totalComments: number;
    totalReplies: number;
    totalDeleted: number;
    averageDepth: number;
  }> {
    const [totalComments, totalReplies, totalDeleted, avgDepthResult] = await Promise.all([
      this.commentRepository.count(),
      this.commentRepository.count({ where: { parentId: Not(null) } }),
      this.commentRepository.count({ where: { isDeleted: true } }),
      this.commentRepository
        .createQueryBuilder('comment')
        .select('AVG(comment.depth)', 'avgDepth')
        .getRawOne(),
    ]);

    return {
      totalComments,
      totalReplies,
      totalDeleted,
      averageDepth: parseFloat(avgDepthResult?.avgDepth || '0'),
    };
  }
}