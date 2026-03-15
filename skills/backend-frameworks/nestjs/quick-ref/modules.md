# NestJS Module Structure

> **Knowledge Base:** Read `knowledge/nestjs/modules.md` for complete documentation.

## Basic Module

```ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // Available to importing modules
})
export class UsersModule {}
```

## Root Module

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      // ...config
    }),
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
```

## Feature Module Pattern

```ts
// users/users.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
```

## Dynamic Modules

```ts
import { Module, DynamicModule } from '@nestjs/common';

@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true, // Make globally available
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useValue: options,
        },
        DatabaseService,
      ],
      exports: [DatabaseService],
    };
  }

  static forFeature(entities: Type[]): DynamicModule {
    return {
      module: DatabaseModule,
      providers: entities.map(entity => ({
        provide: `${entity.name}Repository`,
        useFactory: (db: DatabaseService) => db.getRepository(entity),
        inject: [DatabaseService],
      })),
      exports: entities.map(entity => `${entity.name}Repository`),
    };
  }
}
```

## Global Modules

```ts
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
// Now CacheService is available everywhere without importing
```

## Module Re-Exporting

```ts
@Module({
  imports: [CommonModule, LoggerModule],
  exports: [CommonModule, LoggerModule], // Re-export for consumers
})
export class CoreModule {}
```

## Circular Dependencies

```ts
// users.module.ts
@Module({
  imports: [forwardRef(() => OrdersModule)],
  // ...
})
export class UsersModule {}

// orders.module.ts
@Module({
  imports: [forwardRef(() => UsersModule)],
  // ...
})
export class OrdersModule {}
```

## Typical Project Structure

```
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── common.module.ts
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
├── config/
│   └── config.module.ts
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── dto/
│   └── entities/
└── auth/
    ├── auth.module.ts
    └── ...
```

**Official docs:** https://docs.nestjs.com/modules
