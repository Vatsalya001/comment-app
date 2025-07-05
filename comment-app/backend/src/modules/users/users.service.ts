import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(userData: CreateUserData): Promise<User> {
    try {
      const user = this.userRepository.create(userData);
      return await this.userRepository.save(user);
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ConflictException('Username or email already exists');
      }
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['comments', 'notifications'],
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  async findByUsernameOrEmail(username: string, email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: [
        { username },
        { email },
      ],
    });
  }

  async update(id: string, updateData: UpdateUserData): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, updateData);
    return this.userRepository.save(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, {
      lastLoginAt: new Date(),
    });
  }

  async deactivate(id: string): Promise<User> {
    return this.update(id, { isActive: false });
  }

  async activate(id: string): Promise<User> {
    return this.update(id, { isActive: true });
  }

  async verifyEmail(id: string): Promise<User> {
    return this.update(id, { isEmailVerified: true });
  }

  async findMany(options: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  } = {}): Promise<{ users: User[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, search, isActive } = options;
    
    const queryBuilder = this.userRepository.createQueryBuilder('user');
    
    if (search) {
      queryBuilder.where(
        '(user.username ILIKE :search OR user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` }
      );
    }
    
    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }
    
    queryBuilder
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    
    const [users, total] = await queryBuilder.getManyAndCount();
    
    return {
      users,
      total,
      page,
      limit,
    };
  }

  async getUserStats(id: string): Promise<{
    commentsCount: number;
    repliesCount: number;
    notificationsCount: number;
    unreadNotificationsCount: number;
  }> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['comments', 'notifications'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const commentsCount = user.comments?.length || 0;
    const repliesCount = user.comments?.filter(comment => comment.parentId !== null).length || 0;
    const notificationsCount = user.notifications?.length || 0;
    const unreadNotificationsCount = user.notifications?.filter(notification => !notification.isRead).length || 0;

    return {
      commentsCount,
      repliesCount,
      notificationsCount,
      unreadNotificationsCount,
    };
  }

  async delete(id: string): Promise<void> {
    const result = await this.userRepository.softDelete(id);
    if (result.affected === 0) {
      throw new NotFoundException('User not found');
    }
  }

  async restore(id: string): Promise<User> {
    await this.userRepository.restore(id);
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}