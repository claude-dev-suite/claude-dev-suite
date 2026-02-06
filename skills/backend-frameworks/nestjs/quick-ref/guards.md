# NestJS Guards & Pipes

> **Knowledge Base:** Read `knowledge/nestjs/guards.md` for complete documentation.

## Authentication Guard

```ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

## Role-Based Guard

```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some(role => user.roles?.includes(role));
  }
}

// Usage
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get()
  @Roles('admin')
  getAdminData() {}
}
```

## Validation Pipe

```ts
import { ValidationPipe } from '@nestjs/common';

// Global (main.ts)
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,           // Strip non-decorated properties
  forbidNonWhitelisted: true, // Throw on extra properties
  transform: true,           // Transform payloads to DTO instances
  transformOptions: {
    enableImplicitConversion: true, // Convert query params
  },
}));
```

## Custom Validation Pipe

```ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const val = parseInt(value, 10);
    if (isNaN(val)) {
      throw new BadRequestException('Validation failed: not a number');
    }
    return val;
  }
}

// Usage
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) {}
```

## DTO with Validation

```ts
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase())
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsOptional()
  name?: string;
}
```

## Global Guards

```ts
// main.ts
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
```

## Public Routes Decorator

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// In JwtAuthGuard
canActivate(context: ExecutionContext) {
  const isPublic = this.reflector.getAllAndOverride<boolean>(
    IS_PUBLIC_KEY,
    [context.getHandler(), context.getClass()]
  );
  if (isPublic) return true;
  // ... rest of auth logic
}

// Usage
@Public()
@Get('health')
healthCheck() {}
```

**Official docs:** https://docs.nestjs.com/guards
