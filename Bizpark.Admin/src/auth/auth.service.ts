import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { adminDb, AdminRole } from 'bizpark.core';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    await this.bootstrapFirstAdminIfNeeded(normalizedEmail, password);

    const admin = await adminDb.adminUser.findUnique({ where: { email: normalizedEmail } });
    if (!admin || admin.isActive === false) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const matches = await bcrypt.compare(password, admin.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const payload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    return {
      token: this.jwtService.sign(payload),
      admin: payload,
    };
  }

  async verifyToken(token: string) {
    const payload = this.jwtService.verify<{
      sub: string;
      email: string;
      name: string;
      role: AdminRole;
    }>(token);
    const admin = await adminDb.adminUser.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.isActive === false) {
      throw new UnauthorizedException('Invalid admin session');
    }
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  }

  private async bootstrapFirstAdminIfNeeded(email: string, password: string) {
    const adminCount = await adminDb.adminUser.count();
    if (adminCount > 0) {
      return;
    }

    const bootstrapEmail = (process.env.ADMIN_EMAIL || 'admin@bizpark.local').trim().toLowerCase();
    const bootstrapPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
    if (email !== bootstrapEmail || password !== bootstrapPassword) {
      return;
    }

    await adminDb.adminUser.create({
      data: {
        email: bootstrapEmail,
        name: process.env.ADMIN_NAME || 'Bizpark Admin',
        passwordHash: await bcrypt.hash(bootstrapPassword, 10),
        role: AdminRole.SUPER_ADMIN,
        isActive: true,
      },
    });
  }
}
