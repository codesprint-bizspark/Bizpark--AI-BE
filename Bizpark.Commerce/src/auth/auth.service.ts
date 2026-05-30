import { BadRequestException, ConflictException, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TenantDataSourceFactory } from '../db/tenant-datasource.factory';
import { CommerceUserEntity, CommerceUserRole } from '../db/entities';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantDb: TenantDataSourceFactory,
  ) {}

  async register(tenantId: string, email: string, password: string, name: string, role: CommerceUserRole = 'CUSTOMER') {
    const normalizedEmail = email.trim().toLowerCase();
    const repo = await this.repo(tenantId);

    const existing = await repo.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      throw new BadRequestException('Email already in use for this tenant');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = repo.create({ email: normalizedEmail, passwordHash, name: name.trim(), role });
    const saved = await repo.save(user);

    return {
      access_token: this.jwtService.sign({ sub: saved.id, tenantId, email: saved.email, role: saved.role }),
      user: { id: saved.id, tenantId, email: saved.email, name: saved.name, role: saved.role },
    };
  }

  async login(tenantId: string, email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const repo = await this.repo(tenantId);

    const user = await repo.findOne({ where: { email: normalizedEmail } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    return {
      access_token: this.jwtService.sign({ sub: user.id, tenantId, email: user.email, role: user.role }),
      user: { id: user.id, tenantId, email: user.email, name: user.name, role: user.role },
    };
  }

  async bootstrapAdmin(tenantId: string, email: string, password: string, name: string) {
    const repo = await this.repo(tenantId);
    const existingAdmin = await repo.findOne({ where: { role: 'ADMIN' } });
    if (existingAdmin) throw new ConflictException('An admin already exists for this tenant');
    return this.register(tenantId, email, password, name, 'ADMIN');
  }

  /**
   * Reset (or create) the tenant admin password and return the email.
   * Used by the platform API to re-reveal store credentials on demand —
   * the plaintext password is never stored, so we set a fresh one.
   */
  async resetAdminPassword(tenantId: string, email: string, password: string, name: string) {
    const repo = await this.repo(tenantId);
    let admin = await repo.findOne({ where: { role: 'ADMIN' } });
    if (!admin) {
      // No admin yet — create one.
      await this.register(tenantId, email, password, name, 'ADMIN');
      return { email };
    }
    admin.passwordHash = await bcrypt.hash(password, 10);
    await repo.save(admin);
    return { email: admin.email };
  }

  async updateProfile(tenantId: string, userId: string, payload: { name?: string; currentPassword?: string; newPassword?: string }) {
    const repo = await this.repo(tenantId);
    const user = await repo.findOne({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');

    if (payload.newPassword) {
      if (!payload.currentPassword) throw new BadRequestException('currentPassword is required to set a new password');
      const isMatch = await bcrypt.compare(payload.currentPassword, user.passwordHash);
      if (!isMatch) throw new UnauthorizedException('Current password is incorrect');
      user.passwordHash = await bcrypt.hash(payload.newPassword, 10);
    }

    if (payload.name) user.name = payload.name.trim();

    const saved = await repo.save(user);
    const { passwordHash: _ph, ...safeUser } = saved;
    return { ...safeUser, tenantId };
  }

  async findById(tenantId: string, userId: string) {
    const repo = await this.repo(tenantId);
    const user = await repo.findOne({ where: { id: userId } });
    if (!user) return null;
    const { passwordHash: _ph, ...safeUser } = user;
    return { ...safeUser, tenantId };
  }

  private async repo(tenantId: string) {
    const ds = await this.tenantDb.getDataSource(tenantId);
    return ds.getRepository(CommerceUserEntity);
  }
}
