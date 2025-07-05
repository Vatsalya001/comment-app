import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../modules/users/entities/user.entity';
import { Comment } from '../modules/comments/entities/comment.entity';
import { Notification } from '../modules/notifications/entities/notification.entity';

const configService = new ConfigService();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: configService.get<string>('DATABASE_URL') || 'postgresql://postgres:postgres@localhost:5432/comment_app',
  host: configService.get<string>('database.host') || 'localhost',
  port: configService.get<number>('database.port') || 5432,
  username: configService.get<string>('database.username') || 'postgres',
  password: configService.get<string>('database.password') || 'postgres',
  database: configService.get<string>('database.database') || 'comment_app',
  entities: [User, Comment, Notification],
  migrations: ['src/migrations/*.ts'],
  synchronize: configService.get<string>('NODE_ENV') === 'development',
  logging: configService.get<string>('NODE_ENV') === 'development',
  ssl: configService.get<string>('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
  extra: {
    // Connection pool settings for better performance
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
});

export default AppDataSource;